// app/api/events/checkin/route.ts
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

const CheckInSchema = z.object({
  eventId: z.string().min(1),
  creatorClerkId: z.string().min(1),
  otp: z.string().length(4),
});

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    const parsed = CheckInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventId, creatorClerkId, otp } = parsed.data;

    if (!/^[a-fA-F0-9]{24}$/.test(eventId)) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const events = db.collection("events");

    const ev = await events.findOne({ _id: new ObjectId(eventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // ✅ Only creator can check in attendees
    if (String((ev as any).creatorClerkId) !== creatorClerkId) {
      return NextResponse.json({ error: "Only the event creator can check in attendees" }, { status: 403 });
    }

    const attendees: any[] = Array.isArray((ev as any).attendees) ? (ev as any).attendees : [];

    // ✅ Find attendee with matching OTP
    const matchIdx = attendees.findIndex(
      (a) => String(a.checkInOtp) === String(otp)
    );

    if (matchIdx === -1) {
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 400 });
    }

    const attendee = attendees[matchIdx];

    // ✅ Already checked in?
    if (attendee.checkedIn) {
      return NextResponse.json({
        ok: false,
        error: "Already checked in",
        attendee: { name: attendee.name, checkedInAt: attendee.checkedInAt },
      }, { status: 400 });
    }

    // ✅ Mark checked in
    await events.updateOne(
      { _id: new ObjectId(eventId) },
      {
        $set: {
          [`attendees.${matchIdx}.checkedIn`]: true,
          [`attendees.${matchIdx}.checkedInAt`]: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const checkedInCount = attendees.filter((a) => a.checkedIn).length + 1;

    return NextResponse.json({
      ok: true,
      checkedIn: true,
      attendee: {
        name: attendee.name || "Guest",
        email: attendee.email || "",
        phone: attendee.phone || "",
        clerkId: attendee.clerkId,
      },
      checkedInCount,
      totalAttendees: attendees.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}