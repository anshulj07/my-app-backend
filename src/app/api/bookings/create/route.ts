// app/api/bookings/create/route.ts
// POST /api/bookings/create
// Koi bhi user kisi service/event ko book kar sakta hai with date range

import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function calcDays(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const {
      bookerId,        // clerkUserId of person booking
      hostId,          // clerkUserId of service/event creator
      eventId,         // optional - if booking an event slot
      type,            // "person" | "event" | "service"
      startDate,       // "YYYY-MM-DD"
      endDate,         // "YYYY-MM-DD" (same as startDate for single day)
      pricePerDay,     // in paise (e.g. 50000 = ₹500/day)
      notes,           // optional message from booker
      bookerName,
      bookerEmail,
      bookerPhone,
      bookerImageUrl,
      startTime,       // "HH:mm"
      duration,        // number of hours
    } = body;

    // ── Validate ─────────────────────────────────────────────────────────────
    if (!bookerId || !hostId || !type || !startDate || !endDate) {
      return NextResponse.json(
        { error: "bookerId, hostId, type, startDate, endDate required" },
        { status: 400 }
      );
    }

    if (!["person", "event", "service"].includes(type)) {
      return NextResponse.json({ error: "type must be person, event, or service" }, { status: 400 });
    }

    if (bookerId === hostId) {
      return NextResponse.json({ error: "You cannot book yourself" }, { status: 400 });
    }

    // Validate dates
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }
    if (endMs < startMs) {
      return NextResponse.json({ error: "endDate cannot be before startDate" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // ── Get host profile ──────────────────────────────────────────────────────
    const hostDoc = await db.collection("users").findOne({ clerkUserId: hostId });
    const hostName = `${hostDoc?.profile?.firstName || ""} ${hostDoc?.profile?.lastName || ""}`.trim() || "Host";

    // ── Get event info if eventId provided ────────────────────────────────────
    let eventDoc: any = null;
    let effectivePricePerDay = pricePerDay ?? 0;

    if (eventId) {
      if (!/^[a-fA-F0-9]{24}$/.test(eventId)) {
        return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
      }
      const _id = new ObjectId(eventId);
      
      // ✅ Try 'events' collection first, then 'services'
      eventDoc = await db.collection("events").findOne({ _id });
      if (!eventDoc) {
        eventDoc = await db.collection("services").findOne({ _id });
      }

      if (!eventDoc) return NextResponse.json({ error: "Event not found" }, { status: 404 });

      // Use event's priceCents as pricePerDay if not explicitly passed
      if (!pricePerDay && eventDoc.priceCents) {
        effectivePricePerDay = eventDoc.priceCents;
      }
    }

    const days = calcDays(startDate, endDate);
    // Note: for event bookings, pricePerDay is actually the total amount in paise
    // (frontend sends totalPaise directly). For service bookings, multiply by days.
    const totalPrice = type === "event" ? effectivePricePerDay : effectivePricePerDay * days;
    const isPaid = totalPrice > 0;

    // ── Check if already booked (Duplicate check for events) ──────────────────
    if (type === "event" && eventId) {
      // 1. Check bookings collection
      const existingBooking = await db.collection("bookings").findOne({
        bookerId,
        eventId,
        type: "event",
        status: "confirmed", // 👈 Only block if it's already confirmed
      });

      if (existingBooking) {
        return NextResponse.json(
          { error: "You have already joined/booked this event" },
          { status: 409 }
        );
      }

      // 2. Check both collections for attendees list (safety check)
      const attendeeQuery = { _id: new ObjectId(eventId), "attendees.clerkId": bookerId };
      const inEvents = await db.collection("events").findOne(attendeeQuery);
      const inServices = await db.collection("services").findOne(attendeeQuery);

      if (inEvents || inServices) {
        return NextResponse.json(
          { error: "You are already an attendee of this event" },
          { status: 409 }
        );
      }
    }

    // ── Check host availability (only for person/service bookings, NOT events) ─
    // Events allow multiple attendees — skip conflict check for event type
    // ── Check host availability ─────────────────────────────────────────────
    if (type === "service" && eventId && startTime) {
       // Allow overriding if the conflicting booking is just a stale payment_pending or belongs to the same user
       const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
       const requestedStart = parseInt(startTime.split(":")[0]);
       const requestedEnd = requestedStart + (duration || 1);

       const conflicting = await db.collection("bookings").find({
         eventId,
         status: { $in: ["confirmed", "pending", "payment_pending"] },
         startDate, // same day
         $or: [
           {
             $expr: {
               $and: [
                 { $lt: [ { $toInt: { $arrayElemAt: [{ $split: ["$startTime", ":"] }, 0] } }, requestedEnd ] },
                 { $gt: [ { $add: [ { $toInt: { $arrayElemAt: [{ $split: ["$startTime", ":"] }, 0] } }, { $ifNull: ["$duration", 1] } ] }, requestedStart ] }
               ]
             }
           }
         ]
       }).toArray();

       // Check if any conflicting booking is truly blocking
       const trulyBlocking = conflicting.find(b => {
         if (b.status === "confirmed" || b.status === "pending") return true;
         // If payment_pending:
         if (b.status === "payment_pending") {
           // If it's another user, hold it for 10 minutes max
           if (b.bookerId !== bookerId && b.createdAt > tenMinsAgo) return true;
           // If it's the SAME user, it means they abandoned the previous payment attempt, so don't block them from trying again!
           return false; 
         }
         return false;
       });

       if (trulyBlocking) {
         return NextResponse.json({ error: "This time slot is already booked or someone is currently paying for it." }, { status: 409 });
       }
       
       // Clean up the user's own abandoned payment_pending bookings for this slot to avoid clutter
       await db.collection("bookings").deleteMany({
         bookerId,
         eventId,
         status: "payment_pending",
         startDate
       });
    } else if (type === "person") {
      // Whole day check for person bookings
      const conflicting = await db.collection("bookings").findOne({
        hostId,
        status: { $in: ["confirmed", "pending", "payment_pending"] },
        $or: [
          { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
        ],
      });

      if (conflicting) {
        return NextResponse.json(
          {
            error: "Host is not available for these dates",
            conflictingDates: { start: conflicting.startDate, end: conflicting.endDate },
          },
          { status: 409 }
        );
      }
    }

    // ── Determine Initial Status ─────────────────────────────────────────────
    // If it's a paid event, we wait for payment (payment_pending).
    // If it's free, we check the host's join policy.
    // If approval is required, status is 'pending_approval'.
    // If open join, status is 'confirmed' immediately.
    const joinPolicy = eventDoc?.joinPolicy || "open"; 
    const initialStatus = isPaid 
      ? "payment_pending" 
      : (joinPolicy === "approval" ? "pending_approval" : "confirmed");

    // ── Get real booker profile ──────────────────────────────────────────────
    // Fetch directly from database to avoid generic 'Attendee' or placeholders from frontend.
    const bookerDoc = await db.collection("users").findOne({ clerkUserId: bookerId });
    const bProf = bookerDoc?.profile;
    const realBookerName = bProf?.firstName
      ? `${bProf.firstName} ${bProf.lastName || ""}`.trim()
      : (bookerName || "Guest").trim();
    const realBookerImageUrl = bProf?.avatar?.url || bookerImageUrl || "";

    const bookingDoc = {
      bookerId,
      hostId,
      hostName,
      eventId: eventId || null,
      eventTitle: eventDoc?.title || null,
      eventEmoji: eventDoc?.emoji || null,
      type,                      // "person" | "event" | "service"
      startDate,
      endDate,
      days,
      pricePerDay: effectivePricePerDay,
      totalPrice,
      currency: "INR",
      status: initialStatus,      // ✅ Corrected status assignment
      notes: notes || "",
      booker: {
        clerkId: bookerId,
        name: realBookerName,     // ✅ Real Name
        email: bookerDoc?.email || bookerEmail || "",
        phone: bProf?.phone || bookerPhone || "",
        imageUrl: realBookerImageUrl, // ✅ Real Pic
      },
      startTime: startTime || null,
      duration: duration || null,
      checkInOtp: null,           // set after payment confirmed
      razorpayOrderId: null,
      razorpayPaymentId: null,
      rebookedFrom: null,         // set if this is a rebooking
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("bookings").insertOne(bookingDoc);
    const bookingId = result.insertedId.toString();

    // ── Sync with correct collection (so it shows in 'Going' tab as pending) ──
    if ((type === "event" || type === "service") && eventId) {
      const parentCol = eventDoc.kind === "service" ? "services" : "events";
      
      // ✅ Prevent duplicate entries for the same user in pendingRequests
      await db.collection(parentCol).updateOne(
        { _id: new ObjectId(eventId) },
        { $pull: { pendingRequests: { clerkUserId: bookerId } } as any }
      );

      await db.collection(parentCol).updateOne(
        { _id: new ObjectId(eventId) },
        {
          $push: {
            pendingRequests: {
              clerkUserId: bookerId,
              name: realBookerName,
              email: bookerDoc?.email || bookerEmail || "",
              phone: bProf?.phone || bookerPhone || "",
              message: (notes || "").trim(),
              imageUrl: realBookerImageUrl,
              requestedAt: new Date(),
              bookingId: bookingId,
            }
          } as any,
          $set: { updatedAt: new Date() },
        }
      );
    }

    // ── If free, generate OTP immediately ────────────────────────────────────
    if (!isPaid) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await db.collection("bookings").updateOne(
        { _id: result.insertedId },
        { $set: { checkInOtp: otp, status: "confirmed" } }
      );

      return NextResponse.json({
        ok: true,
        bookingId,
        status: "confirmed",
        checkInOtp: otp,
        days,
        totalPrice: 0,
        requiresPayment: false,
      });
    }

    // ── If paid, create Razorpay order ────────────────────────────────────────
    const KEY_ID = process.env.RAZORPAY_KEY_ID;
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!KEY_ID || !KEY_SECRET) {
      console.error("[CRITICAL] Razorpay keys missing in environment!");
      return NextResponse.json({ 
        error: "Payment gateway is not configured on server. Contact admin." 
      }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
    const order = await razorpay.orders.create({
      amount: totalPrice,
      currency: "INR",
      receipt: `bk_${bookingId.slice(-8)}_${Date.now().toString().slice(-6)}`,
      notes: { bookingId, bookerId, hostId, type },
    });

    // Save orderId to booking
    await db.collection("bookings").updateOne(
      { _id: result.insertedId },
      { $set: { razorpayOrderId: order.id, updatedAt: new Date() } }
    );

    return NextResponse.json({
      ok: true,
      bookingId,
      status: "payment_pending",
      requiresPayment: true,
      payment: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: KEY_ID,
      },
      days,
      totalPrice,
      pricePerDay: effectivePricePerDay,
    });

  } catch (e: any) {
    console.error("[POST /api/bookings/create]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}