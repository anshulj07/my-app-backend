// app/api/bookings/verify-payment/route.ts
// POST /api/bookings/verify-payment
// Razorpay payment verify karo aur booking confirm karo

import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import crypto from "crypto";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const {
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "All payment fields required" }, { status: 400 });
    }

    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    if (!KEY_SECRET) {
      return NextResponse.json({ error: "Payment not configured" }, { status: 500 });
    }

    // ── Verify signature ──────────────────────────────────────────────────────
    const expectedSig = crypto
      .createHmac("sha256", KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return NextResponse.json({ ok: false, error: "Invalid payment signature" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    if (!/^[a-fA-F0-9]{24}$/.test(bookingId)) {
      return NextResponse.json({ error: "Invalid bookingId" }, { status: 400 });
    }

    const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // Generate OTP for check-in
    const otp = String(Math.floor(1000 + Math.random() * 9000));

    // ── Confirm booking status ───────────────────────────────────────────────
    // We check the event's join policy. If it's 'approval', we don't 'confirm' (admit)
    // the user yet, even though they paid. They stay in a 'paid_pending_approval' state.
    
    const ev = await db.collection("events").findOne({ _id: new ObjectId(booking.eventId) });
    const joinPolicy = ev?.joinPolicy || "open";
    const statusAfterPayment = joinPolicy === "approval" ? "paid_pending_approval" : "confirmed";

    await db.collection("bookings").updateOne(
      { _id: new ObjectId(bookingId) },
      {
        $set: {
          status: statusAfterPayment,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          checkInOtp: otp,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // ── Save payment record (for accounting) ──────────────────────────────────
    await db.collection("payments").insertOne({
      bookingId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      amount: booking.totalPrice,
      currency: "INR",
      type: "booking",
      status: "verified",
      verifiedAt: new Date(),
      createdAt: new Date(),
    });

    // ── Update events collection ──────────────────────────
    if (booking.type === "event" && booking.eventId) {
      const eventId = booking.eventId;
      
      // Get the existing pending request to preserve user info
      const pendingReq = Array.isArray(ev?.pendingRequests) 
        ? ev.pendingRequests.find((r: any) => String(r.clerkUserId) === String(booking.bookerId))
        : null;

      if (joinPolicy === "approval") {
        /**
         * ── CASE A: APPROVAL REQUIRED ──
         * The user has paid, but the host still needs to admit them.
         * We update the existing pending request to mark it as 'paid'.
         */
        await db.collection("events").updateOne(
          { _id: new ObjectId(eventId), "pendingRequests.clerkUserId": booking.bookerId },
          { 
            $set: { 
              "pendingRequests.$.paid": true, 
              "pendingRequests.$.razorpayPaymentId": razorpay_payment_id,
              "pendingRequests.$.bookingId": bookingId
            } 
          } as any
        );
        console.log(`[VerifyPayment] Booking ${bookingId} is now PAID but PENDING host approval.`);
      } else {
        /**
         * ── CASE B: OPEN JOIN ──
         * No host approval needed. Move the user directly to the attendees list.
         * We fetch their latest real profile data to avoid 'Attendee' placeholders.
         */
        const userDoc = await db.collection("users").findOne({ clerkUserId: booking.bookerId });
        const profile = userDoc?.profile;
        const realName = profile?.firstName 
          ? `${profile.firstName} ${profile.lastName || ""}`.trim() 
          : (booking.booker?.name || "Guest").trim();
        const realImageUrl = profile?.avatar?.url || booking.booker?.imageUrl || "";

        const attendeeData = {
          clerkId:           booking.bookerId,
          name:              realName,      // ✅ Real Profile Name
          imageUrl:          realImageUrl,  // ✅ Real Profile Pic
          email:             userDoc?.email || booking.booker?.email || "",
          phone:             profile?.phone || booking.booker?.phone || "",
          message:           (booking.notes || pendingReq?.message || "").trim(),
          joinedAt:          new Date(),
          checkInOtp:        otp,
          checkedIn:         false,
          checkedInAt:       null,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId:   razorpay_order_id,
          bookingId:         bookingId,
          isPaid:            true, // Clearly it's paid
        };

        await db.collection("events").updateOne(
          { _id: new ObjectId(eventId) },
          {
            $pull: { pendingRequests: { clerkUserId: booking.bookerId } } as any,
            $push: { attendees: attendeeData } as any,
            $set: { updatedAt: new Date() },
          }
        );
      }

      // Track statistics for host (Earning should be counted even if pending approval?)
      // We'll count it now since the money is captured.
      const hostClerkId = booking.hostId;
      if (hostClerkId && hostClerkId !== booking.bookerId) {
        // Repetition check (Have they attended before?)
        const previousJoin = await db.collection("events").findOne({
          creatorClerkId: hostClerkId,
          _id: { $ne: new ObjectId(eventId) },
          "attendees.clerkId": booking.bookerId,
        });
        const isRepeated = !!previousJoin;

        const pricePaise = Number(booking.totalPrice ?? 0);
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const isThisMonth = ev?.startsAt instanceof Date ? ev.startsAt >= startOfMonth : true;

        await db.collection("user_stats").updateOne(
          { clerkUserId: hostClerkId },
          {
            $inc: {
              totalAttendees: 1,
              ...(isRepeated ? { repeatedAttendees: 1 } : { newAttendees: 1 }),
              overallEarning: pricePaise,
              ...(isThisMonth ? { thisMonthEarning: pricePaise } : {}),
            },
            $set: { updatedAt: new Date() },
            $setOnInsert: {
              clerkUserId: hostClerkId,
              eventsHosted: 0,
              rating: 0,
              reviewsCount: 0,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      bookingId,
      status: "confirmed",
      checkInOtp: otp,
    });

  } catch (e: any) {
    console.error("[POST /api/bookings/verify-payment]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}