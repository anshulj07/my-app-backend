// app/api/messages/route.ts
// GET  /api/messages?from=X&to=Y&limit=100
// POST /api/messages

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

function checkApiKey(req: NextRequest): NextResponse | null {
  const key      = req.headers.get("x-api-key");
  const expected = process.env.EVENT_API_KEY;
  if (expected && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const DB   = process.env.MONGODB_DB || "assis_auth";
const COLL = "messages";

async function getChatStatus(from: string, to: string) {
  const client = await clientPromise;
  const db = client.db(DB);
  
  // 1. Check for a confirmed booking
  const booking = await db.collection("bookings").findOne({
    $or: [
      { bookerId: from, hostId: to },
      { bookerId: to, hostId: from },
    ],
    status: "confirmed",
  }, { sort: { endDate: -1 } });

  function isEventPast(ev: any): boolean {
    if (!ev) return false;
    if (ev.status === "ended" || ev.status === "completed") return true;
    
    // Check temporal end
    const now = Date.now();
    let endMs = 0;
    if (ev.endsAt) {
      endMs = new Date(ev.endsAt).getTime();
    } else {
      // Fallback: 3 hours after start
      let startMs = 0;
      if (ev.startsAt) {
        startMs = new Date(ev.startsAt).getTime();
      } else if (ev.date && ev.time) {
        startMs = new Date(`${ev.date}T${ev.time}:00Z`).getTime();
      } else if (ev.date) {
        startMs = new Date(`${ev.date}T12:00:00Z`).getTime();
      }
      if (startMs > 0) endMs = startMs + (3 * 60 * 60 * 1000);
    }
    
    if (endMs > 0 && now > endMs) return true;
    return false;
  }

  // 2. If no booking, check if one is an attendee of the other's event
  if (!booking) {
    const eventWithAttendee = await db.collection("events").findOne({
      $or: [
        { creatorClerkId: from, "attendees.clerkId": to },
        { creatorClerkId: to, "attendees.clerkId": from },
      ]
    }, { sort: { createdAt: -1 } });
    
    if (!eventWithAttendee) {
      return { isLocked: true, reason: "no_confirmed_booking" };
    }
    
    // Check if the event has ended (manually or by time)
    if (isEventPast(eventWithAttendee)) {
      return { isLocked: true, reason: "event_ended" };
    }
    
    return { isLocked: false };
  }

  // 3. If booking exists, check if it's expired or the event has ended
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  if (booking.endDate && booking.endDate < today) {
    return { isLocked: true, reason: "booking_expired", bookingId: booking._id.toString() };
  }

  // Also check the event status/time for the booking
  if (booking.eventId) {
    const event = await db.collection("events").findOne({ _id: new ObjectId(booking.eventId) });
    if (isEventPast(event)) {
      return { isLocked: true, reason: "event_ended", bookingId: booking._id.toString() };
    }
  }

  return { isLocked: false, bookingId: booking._id.toString() };
}

export async function GET(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  // Accept both old (from/to) and new (fromClerkUserId/toClerkUserId) param names
  const from  = (searchParams.get("fromClerkUserId") || searchParams.get("from"))?.trim();
  const to    = (searchParams.get("toClerkUserId")   || searchParams.get("to"))?.trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

  if (!from || !to) {
    return NextResponse.json({ error: "fromClerkUserId and toClerkUserId are required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    const messages = await db.collection(COLL)
      .find({
        $or: [
          { fromClerkUserId: from, toClerkUserId: to },
          { fromClerkUserId: to,   toClerkUserId: from },
        ],
        deletedFor: { $ne: from }
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    const formatted = messages.map(m => ({
      _id:             m._id.toString(),
      id:              m._id.toString(),
      fromClerkUserId: m.fromClerkUserId,
      toClerkUserId:   m.toClerkUserId,
      senderId:        m.fromClerkUserId,   // legacy compat
      text:            m.text,
      createdAt:       m.createdAt,
      status:          m.status || "sent",
    }));

    await db.collection(COLL).updateMany(
      { fromClerkUserId: to, toClerkUserId: from, status: { $ne: "read" } },
      { $set: { status: "read" } }
    );

    const chatStatus = await getChatStatus(from, to);

    return NextResponse.json({ 
      messages: formatted,
      chatStatus 
    });
  } catch (e: any) {
    console.error("[GET /api/messages]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fromClerkUserId, toClerkUserId, text } = body;

  if (!fromClerkUserId || !toClerkUserId || !text?.trim()) {
    return NextResponse.json({ error: "fromClerkUserId, toClerkUserId and text are required" }, { status: 400 });
  }

  try {
    const chatStatus = await getChatStatus(fromClerkUserId, toClerkUserId);
    if (chatStatus.isLocked) {
      return NextResponse.json({ 
        error: "Chat is locked", 
        reason: chatStatus.reason 
      }, { status: 403 });
    }

    const client = await clientPromise;
    const db     = client.db(DB);

    const doc = {
      fromClerkUserId: fromClerkUserId.trim(),
      toClerkUserId:   toClerkUserId.trim(),
      text:            text.trim(),
      createdAt:       new Date().toISOString(),
      status:          "sent" as const,
    };

    const result = await db.collection(COLL).insertOne(doc);

    return NextResponse.json({
      message: {
        id:        result.insertedId.toString(),
        senderId:  doc.fromClerkUserId,
        text:      doc.text,
        createdAt: doc.createdAt,
        status:    doc.status,
      }
    }, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/messages]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fromClerkUserId, toClerkUserId } = body;
  if (!fromClerkUserId || !toClerkUserId) {
    return NextResponse.json({ error: "fromClerkUserId and toClerkUserId are required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    await db.collection(COLL).updateMany(
      {
        $or: [
          { fromClerkUserId, toClerkUserId },
          { fromClerkUserId: toClerkUserId, toClerkUserId: fromClerkUserId },
        ]
      },
      { $addToSet: { deletedFor: fromClerkUserId } }
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/messages]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}