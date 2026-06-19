// app/api/events/join/route.ts
// POST /api/events/join
// Directly adds user as attendee (for open events and paid events post-payment)
// Body: { eventId, clerkUserId, name, email?, phone?, message?, imageUrl?, razorpayPaymentId?, razorpayOrderId? }
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const key = process.env.EVENT_API_KEY;
  if (!key) return null;
  return req.headers.get("x-api-key") === key
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function genOtp() { return String(Math.floor(1000 + Math.random() * 9000)); }

export async function POST(req: Request) {
  const guard = requireApiKey(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => null);
    const {
      eventId,
      clerkUserId,
      name,
      email,
      phone,
      message,
      imageUrl,
      razorpayPaymentId,
      razorpayOrderId,
    } = body ?? {};

    if (!eventId || !clerkUserId || !name)
      return NextResponse.json({ error: "eventId, clerkUserId, name required" }, { status: 400 });

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });

    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // For paid events, razorpayPaymentId is required
    const isPaid = (ev as any).kind === "paid" || (ev as any).kind === "event_paid";
    if (isPaid && !razorpayPaymentId) {
      return NextResponse.json({ error: "razorpayPaymentId required for paid events" }, { status: 400 });
    }

    // Check if already joined (idempotent)
    const existingAttendee = ((ev as any).attendees || []).find(
      (a: any) => String(a.clerkId || "") === clerkUserId
    );
    if (existingAttendee) {
      return NextResponse.json({
        ok: true,
        status: "already_joined",
        checkInOtp: existingAttendee.checkInOtp,
      });
    }

    // Capacity check
    const maxCapacity = (ev as any).maxCapacity;
    const currentCount = ((ev as any).attendees || []).length;
    if (maxCapacity && currentCount >= maxCapacity) {
      return NextResponse.json({ error: "Event is full", detail: "No more spots available." }, { status: 409 });
    }

    // Resolve imageUrl from user profile if not provided
    let finalImageUrl = String(imageUrl || "").trim();
    if (!finalImageUrl) {
      const userDoc = await db.collection("users").findOne({ clerkUserId });
      finalImageUrl = (userDoc as any)?.profile?.avatar?.url || "";
    }

    const otp = genOtp();

    await db.collection("events").updateOne(
      { _id: new ObjectId(eventId) },
      {
        $push: {
          attendees: {
            clerkId:           clerkUserId,
            name:              String(name).trim(),
            email:             String(email || ""),
            phone:             String(phone || ""),
            message:           String(message || ""),
            imageUrl:          finalImageUrl,
            joinedAt:          new Date(),
            checkInOtp:        otp,
            checkedIn:         false,
            checkedInAt:       null,
            // Payment info (if paid)
            ...(razorpayPaymentId ? { razorpayPaymentId, razorpayOrderId } : {}),
          },
        } as any,
        $set: { updatedAt: new Date() },
      }
    );

    // ✅ Track totalAttendees in user_stats for the event host
    const hostClerkId = String((ev as any).creatorClerkId || "");
    if (hostClerkId && hostClerkId !== clerkUserId) {
      // Check if this attendee has joined any other event by this host (repeated vs new)
      const previousJoin = await db.collection("events").findOne({
        creatorClerkId: hostClerkId,
        _id: { $ne: new ObjectId(eventId) },
        "attendees.clerkId": clerkUserId,
      });
      const isRepeated = !!previousJoin;

      await db.collection("user_stats").updateOne(
        { clerkUserId: hostClerkId },
        {
          $inc: {
            totalAttendees: 1,
            ...(isRepeated ? { repeatedAttendees: 1 } : { newAttendees: 1 }),
          },
          $set: { updatedAt: new Date() },
          $setOnInsert: {
            clerkUserId: hostClerkId,
            eventsHosted: 0,
            rating: 0,
            reviewsCount: 0,
            thisMonthEarning: 0,
            overallEarning: 0,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    // ✅ Track earnings if this is a paid event
    if ((ev as any).kind === "paid" && razorpayPaymentId) {
      const pricePaise = Number((ev as any).priceCents ?? 0);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const isThisMonth = 
        (ev as any).startsAt instanceof Date
          ? (ev as any).startsAt >= startOfMonth
          : true; // default true for current month events

      await db.collection("user_stats").updateOne(
        { clerkUserId: hostClerkId },
        {
          $inc: {
            overallEarning: pricePaise,
            ...(isThisMonth ? { thisMonthEarning: pricePaise } : {}),
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({
      ok:         true,
      status:     "joined",
      checkInOtp: otp,
    });
  } catch (e: any) {
    console.error("[POST /api/events/join]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}