import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay"; // ✅ Required for refund processing

/**
 * Ensures the requester has a valid API Key.
 */
function requireApiKey(req: Request) {
  const key = process.env.EVENT_API_KEY;
  if (!key) return null;
  return req.headers.get("x-api-key") === key
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Generates a 4-digit numeric OTP for check-in verification.
 */
function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

/**
 * POST /api/events/admit-request
 * Handles logic for a host either Admitting or Rejecting a pending join request.
 */
export async function POST(req: Request) {
  const guard = requireApiKey(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => null);
    const { eventId, creatorClerkId, requestClerkUserId, action } = body ?? {};

    if (!eventId || !creatorClerkId || !requestClerkUserId || !["admit", "reject"].includes(action))
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });

    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (String((ev as any).creatorClerkId) !== creatorClerkId)
      return NextResponse.json({ error: "Only creator can admit/reject" }, { status: 403 });

    const pending: any[] = (ev as any).pendingRequests || [];
    const req_data = pending.find((p: any) => String(p.clerkUserId || "") === requestClerkUserId);
    if (!req_data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    // ── 1. CLEANUP PENDING LIST ──────────────────────────────────────────────
    // Always remove from pending regardless of admit or reject outcome.
    await db.collection("events").updateOne(
      { _id: new ObjectId(eventId) },
      { $pull: { pendingRequests: { clerkUserId: requestClerkUserId } } } as any
    );

    // ── 2. HANDLE ADMIT (SUCCESS) ────────────────────────────────────────────
    if (action === "admit") {
      const otp = genOtp();
      // ── IMPROVED IDENTITY FETCHING ──────────────────────────────────────────
      // Instead of relying on generic 'Attendee', we fetch the real profile.
      const userDoc = await db.collection("users").findOne({ clerkUserId: requestClerkUserId });
      const profile = userDoc?.profile;
      
      const realName = profile?.firstName 
        ? `${profile.firstName} ${profile.lastName || ""}`.trim() 
        : (req_data.name || "Guest").trim();
      
      const realImageUrl = profile?.avatar?.url || req_data.imageUrl || "";

      // Add to confirmed attendees list
      await db.collection("events").updateOne(
        { _id: new ObjectId(eventId) },
        {
          $push: {
            attendees: {
              clerkId: requestClerkUserId,
              name: realName,           // ✅ Real Profile Name
              imageUrl: realImageUrl,   // ✅ Real Profile Pic
              email: req_data.email || userDoc?.email || "",
              phone: req_data.phone || profile?.phone || "",
              message: req_data.message || "",
              joinedAt: new Date(),
              checkInOtp: otp,
              checkedIn: false,
              checkedInAt: null,
              bookingId: req_data.bookingId || null,
              isPaid: !!req_data.paid,  // Track if they paid
            },
          } as any,
          $set: { updatedAt: new Date() },
        }
      );

      // Also update the external 'bookings' collection status to 'confirmed'
      const bookingId = (req_data as any).bookingId;
      if (bookingId) {
        await db.collection("bookings").updateOne(
          { _id: new ObjectId(bookingId) },
          { $set: { status: "confirmed", checkInOtp: otp, updatedAt: new Date() } }
        );
      }

      return NextResponse.json({ ok: true, action: "admitted" });
    }

    // ── 3. HANDLE REJECT (REFUND LOGIC) ──────────────────────────────────────
    if (action === "reject") {
      /**
       * If the host rejects a PAID request, we MUST refund the money.
       * We use the booking ID stored in the pending request to find the transaction.
       */
      const bookingId = (req_data as any).bookingId;
      if (bookingId) {
        const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
        
        // If this was a paid booking with a valid payment ID, trigger Razorpay refund
        if (booking && booking.razorpayPaymentId) {
          const KEY_ID = process.env.RAZORPAY_KEY_ID;
          const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
          
          if (KEY_ID && KEY_SECRET) {
            const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
            try {
              // Create a full refund for the payment
              const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
                notes: { 
                  reason: "Host rejected join request", 
                  eventId: eventId, 
                  bookingId: bookingId 
                }
              });
              
              // Mark as rejected in bookings collection and record the refund ID
              await db.collection("bookings").updateOne(
                { _id: new ObjectId(bookingId) },
                { 
                  $set: { 
                    status: "rejected", 
                    razorpayRefundId: (refund as any).id,
                    refundedAt: new Date(),
                    updatedAt: new Date()
                  } 
                }
              );
              console.log(`[Refund] Initiated for booking ${bookingId}`);
            } catch (refundErr: any) {
              console.error("[Refund Error]", refundErr);
              // Mark as rejected even if refund fails (to prevent double-processing)
              await db.collection("bookings").updateOne(
                { _id: new ObjectId(bookingId) },
                { $set: { status: "rejected", refundError: refundErr.message, updatedAt: new Date() } }
              );
            }
          }
        } else if (booking) {
          // If free event, just mark the booking as rejected
          await db.collection("bookings").updateOne(
            { _id: new ObjectId(bookingId) },
            { $set: { status: "rejected", updatedAt: new Date() } }
          );
        }
      }

      return NextResponse.json({ ok: true, action: "rejected" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("[POST /api/events/admit-request] Error:", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}