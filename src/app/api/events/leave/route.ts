// app/api/events/leave/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const Schema = z.object({
  eventId: z.string().min(1),
  clerkUserId: z.string().min(1),
  reason: z.string().min(1).max(300),
});

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const { eventId, clerkUserId, reason } = parsed.data;

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Check if user is actually an attendee
    const attendees: any[] = Array.isArray(ev.attendees) ? ev.attendees : [];
    const idx = attendees.findIndex((a: any) => String(a.clerkId || a.clerkUserId || "") === clerkUserId);
    if (idx === -1)
      return NextResponse.json({ error: "You haven't joined this event" }, { status: 400 });

    // Remove attendee + log reason
    await db.collection("events").updateOne(
      { _id: new ObjectId(eventId) },
      {
        $pull: { attendees: { clerkId: clerkUserId } } as any,
        $push: {
          leaveLog: {
            clerkUserId,
            reason,
            leftAt: new Date(),
          },
        } as any,
        $set: { updatedAt: new Date() },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}