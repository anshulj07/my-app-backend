// app/api/events/is-joined/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isValidObjectId(id: string) {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const eventId = String(searchParams.get("eventId") || "");
    const clerkUserId = String(searchParams.get("clerkUserId") || "");

    if (!eventId || !clerkUserId) {
      return NextResponse.json({ error: "Missing eventId or clerkUserId" }, { status: 400 });
    }

    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    // Efficient: just check if an attendee entry exists
    const ev = await db.collection("events").findOne(
      { _id: new ObjectId(eventId), "attendees.clerkId": clerkUserId },
      { projection: { _id: 1 } }
    );

    return NextResponse.json({ ok: true, joined: !!ev }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
