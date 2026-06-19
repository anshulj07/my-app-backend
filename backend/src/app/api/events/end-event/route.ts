// app/api/events/end-event/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { updateHostStats } from "../../../../../lib/statsUpdater";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const Schema = z.object({
  eventId: z.string().min(1),
  creatorClerkId: z.string().min(1),
});

export async function PATCH(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { eventId, creatorClerkId } = parsed.data;

    if (!/^[a-fA-F0-9]{24}$/.test(eventId)) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // ✅ Only creator can end event
    if (String((ev as any).creatorClerkId) !== creatorClerkId) {
      return NextResponse.json({ error: "Only the creator can end this event" }, { status: 403 });
    }

    // 💰 CALCULATE FINAL EARNINGS 💰
    const attendees: any[] = Array.isArray((ev as any).attendees) ? (ev as any).attendees : [];
    // Count attendees who paid (isPaid flag or razorpayPaymentId)
    const paidAttendees = attendees.filter(a => a.isPaid === true || !!a.razorpayPaymentId);
    const priceCents = Number((ev as any).priceCents || 0);
    const finalEarnings = paidAttendees.length * priceCents;

    await db.collection("events").updateOne(
      { _id: new ObjectId(eventId) },
      { 
        $set: { 
          status: "ended", 
          endedAt: new Date(), 
          updatedAt: new Date(),
          finalEarnings,
          finalAttendeeCount: paidAttendees.length
        } 
      }
    );

    // 🔄 SYNC HOST STATS IMMEDIATELY 🔄
    const newStats = await updateHostStats(creatorClerkId);

    return NextResponse.json({ 
      ok: true, 
      status: "ended", 
      finalEarnings, 
      paidAttendees: paidAttendees.length,
      newStats 
    });
  } catch (e: any) {
    console.error("PATCH /api/events/end-event failed:", e);
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}