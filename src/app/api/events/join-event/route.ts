// app/api/events/join/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { z } from "zod";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const JoinSchema = z.object({
  eventId: z.string().min(1),
  clerkUserId: z.string().min(1),

  // attendee details (send from frontend)
  name: z.string().max(120).optional().default(""),
  email: z.string().max(200).optional().default(""),
  imageUrl: z.string().max(500).optional().default(""),
});

function isValidObjectId(id: string) {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    const parsed = JoinSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    if (!isValidObjectId(payload.eventId)) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const now = new Date();
    const eventObjectId = new ObjectId(payload.eventId);

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");
    const events = db.collection("events");

    // 1) ensure event exists + enforce free-only join (recommended)
    const ev = await events.findOne(
      { _id: eventObjectId },
      { projection: { kind: 1 } }
    );

    if (!ev) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const kind = String((ev as any).kind || "free").toLowerCase();
    if (kind !== "free") {
      return NextResponse.json(
        { error: "Payment required", detail: "Use payment flow for paid/service events." },
        { status: 400 }
      );
    }

    // 2) build attendee object (store full details)
    const attendee = {
      clerkId: payload.clerkUserId,
      name: (payload.name || "").trim(),
      email: (payload.email || "").trim(),
      imageUrl: (payload.imageUrl || "").trim(),
      joinedAt: now,
    };

    // 3) push only if this clerkId is not already in attendees[]
    const updateRes = await events.updateOne(
      {
        _id: eventObjectId,
        "attendees.clerkId": { $ne: payload.clerkUserId },
      },
      // cast to any to satisfy TypeScript MongoDB operator typings for dynamic schema
      ({
        $push: { attendees: attendee },
        $set: { updatedAt: now },
      } as any)
    );

    // If matchedCount=0 it means either already joined OR event missing (but we already checked event exists)
    if (updateRes.matchedCount === 0) {
      return NextResponse.json(
        { ok: true, joined: true, alreadyJoined: true, attendee },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ok: true, joined: true, alreadyJoined: false, attendee },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}
