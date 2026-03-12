// app/api/events/admit-request/route.ts
// Host admits or rejects a pending join request
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
    const { eventId, creatorClerkId, requestClerkUserId, action } = body ?? {};

    if (!eventId || !creatorClerkId || !requestClerkUserId || !["admit", "reject"].includes(action))
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });

    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (String((ev as any).creatorClerkId) !== creatorClerkId)
      return NextResponse.json({ error: "Only creator can admit/reject" }, { status: 403 });

    const pending: any[] = (ev as any).pendingRequests || [];
    const req_data = pending.find((p: any) => String(p.clerkUserId || "") === requestClerkUserId);
    if (!req_data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    // Remove from pending
    await db.collection("events").updateOne(
      { _id: new ObjectId(eventId) },
      { $pull: { pendingRequests: { clerkUserId: requestClerkUserId } } } as any
    );

    if (action === "admit") {
      const otp = genOtp();
      let finalImageUrl = String(req_data.imageUrl || "").trim();
      if (!finalImageUrl) {
        const userDoc = await db.collection("users").findOne({ clerkUserId: requestClerkUserId });
        finalImageUrl = userDoc?.profile?.avatar?.url || "";
      }

      await db.collection("events").updateOne(
        { _id: new ObjectId(eventId) },
        {
          $push: {
            attendees: {
              clerkId: requestClerkUserId,
              name: req_data.name,
              email: req_data.email,
              phone: req_data.phone,
              message: req_data.message,
              imageUrl: finalImageUrl,
              joinedAt: new Date(),
              checkInOtp: otp,
              checkedIn: false,
              checkedInAt: null,
            },
          } as any,
          $set: { updatedAt: new Date() },
        }
      );
      return NextResponse.json({ ok: true, action: "admitted" });
    }

    return NextResponse.json({ ok: true, action: "rejected" });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}