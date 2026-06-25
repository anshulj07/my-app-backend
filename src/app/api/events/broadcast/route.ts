import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
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

const DB = process.env.MONGODB_DB || "assis_auth";
const EVENTS_COLL = "events";
const MESSAGES_COLL = "messages";

export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventId, fromClerkUserId, text } = body;

  if (!eventId || !fromClerkUserId || !text?.trim()) {
    return NextResponse.json({ error: "eventId, fromClerkUserId and text are required" }, { status: 400 });
  }

  if (!/^[a-fA-F0-9]{24}$/.test(eventId)) {
    return NextResponse.json({ error: "Invalid eventId format" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    // 1. Fetch the event and verify the host
    const event = await db.collection(EVENTS_COLL).findOne({ _id: new ObjectId(eventId) });

    if (!event) {
      return NextResponse.json({ error: "Event not found in database" }, { status: 404 });
    }

    const hostId = String(event.creatorClerkId || event.clerkUserId || "").trim();
    const requestUserId = String(fromClerkUserId).trim();
    
    if (!hostId) {
      return NextResponse.json({ error: "Event has no host" }, { status: 500 });
    }
    
    if (hostId !== requestUserId) {
      return NextResponse.json({ error: `Only the host can broadcast messages. Host is ${hostId}, you are ${requestUserId}` }, { status: 403 });
    }

    const attendees = event.attendees || [];
    if (!Array.isArray(attendees) || attendees.length === 0) {
      return NextResponse.json({ message: "No attendees to broadcast to", count: 0 }, { status: 200 });
    }

    // Filter out the host if they are somehow in the attendees list, and those without a clerkId
    const validAttendees = attendees.filter((a: any) => {
      const id = a.clerkId || a.clerkUserId || a.userId;
      return id && id !== hostId;
    });

    if (validAttendees.length === 0) {
      return NextResponse.json({ message: "No valid attendees to broadcast to", count: 0 }, { status: 200 });
    }

    // 2. Prepare message documents
    const timestamp = new Date().toISOString();
    const messageDocs = validAttendees.map((att: any) => {
      const toId = att.clerkId || att.clerkUserId || att.userId;
      return {
        fromClerkUserId: hostId.trim(),
        toClerkUserId:   toId.trim(),
        text:            text.trim(),
        createdAt:       timestamp,
        status:          "sent",
      };
    });

    // 3. Bulk insert messages
    if (messageDocs.length > 0) {
      await db.collection(MESSAGES_COLL).insertMany(messageDocs);
    }

    return NextResponse.json({ 
      message: "Broadcast sent successfully", 
      count: messageDocs.length 
    }, { status: 200 });
  } catch (e: any) {
    console.error("[POST /api/events/broadcast]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
