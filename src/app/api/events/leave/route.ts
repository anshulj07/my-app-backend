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
  reason: z.string().optional(),
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
    const leaveReason = reason || "User cancelled / left";

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Check confirmed attendees
    const attendees: any[] = Array.isArray(ev.attendees) ? ev.attendees : [];
    const isAttendee = attendees.some((a: any) => String(a.clerkId || a.clerkUserId || "") === clerkUserId);

    // Check pending requests
    const pending: any[] = Array.isArray(ev.pendingRequests) ? ev.pendingRequests : [];
    const isPending = pending.some((p: any) => String(p.clerkUserId || "") === clerkUserId);

    if (!isAttendee && !isPending)
      return NextResponse.json({ error: "You are not part of this event" }, { status: 400 });

    const update: any = {
      $set: { updatedAt: new Date() },
    };

    if (isAttendee) {
      update.$pull = { attendees: { clerkId: clerkUserId } };
    } else if (isPending) {
      update.$pull = { pendingRequests: { clerkUserId: clerkUserId } };
    }

    // Add to leave log if it's a confirmed attendee leaving
    if (isAttendee) {
      update.$push = {
        leaveLog: {
          clerkUserId,
          reason: leaveReason,
          leftAt: new Date(),
        },
      };
    }

    await db.collection("events").updateOne(
      { _id: new ObjectId(eventId) },
      update
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}