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