// app/api/bookings/cancel/route.ts
// POST /api/bookings/cancel
// Booker ya host dono cancel kar sakte hain

import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

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

    const { bookingId, clerkUserId, reason } = body;

    if (!bookingId || !clerkUserId) {
      return NextResponse.json({ error: "bookingId and clerkUserId required" }, { status: 400 });
    }

    if (!/^[a-fA-F0-9]{24}$/.test(bookingId)) {
      return NextResponse.json({ error: "Invalid bookingId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // Only booker or host can cancel
    if (booking.bookerId !== clerkUserId && booking.hostId !== clerkUserId) {
      return NextResponse.json({ error: "Not authorized to cancel this booking" }, { status: 403 });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Booking is already ${booking.status}` },
        { status: 400 }
      );
    }

    const cancelledBy = booking.bookerId === clerkUserId ? "booker" : "host";

    await db.collection("bookings").updateOne(
      { _id: new ObjectId(bookingId) },
      {
        $set: {
          status: "cancelled",
          cancelledBy,
          cancelReason: reason || "",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ ok: true, status: "cancelled", cancelledBy });

  } catch (e: any) {
    console.error("[POST /api/bookings/cancel]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}