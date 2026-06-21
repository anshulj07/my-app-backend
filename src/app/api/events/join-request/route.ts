// app/api/events/join-request/route.ts
// For approval-required events — adds user to pendingRequests array
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

export async function POST(req: Request) {
  const guard = requireApiKey(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => null);
    const { eventId, clerkUserId, name, email, phone, message, imageUrl } = body ?? {};

    if (!eventId || !clerkUserId || !name)
      return NextResponse.json({ error: "eventId, clerkUserId, name required" }, { status: 400 });

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");
    let ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    let parentCol = "events";
    
    if (!ev) {
      ev = await db.collection("services").findOne({ _id: new ObjectId(eventId) });
      parentCol = "services";
    }

    if (!ev) return NextResponse.json({ error: "Event/Service not found" }, { status: 404 });
    if ((ev as any).joinPolicy !== "approval")
      return NextResponse.json({ error: "Use /join for open events" }, { status: 400 });

    // Already attendee?
    const alreadyIn = ((ev as any).attendees || []).some(
      (a: any) => String(a.clerkId || "") === clerkUserId
    );
    if (alreadyIn) return NextResponse.json({ ok: true, status: "already_joined" });

    // Already pending?
    const alreadyPending = ((ev as any).pendingRequests || []).some(
      (p: any) => String(p.clerkUserId || "") === clerkUserId
    );
    if (alreadyPending) return NextResponse.json({ ok: true, status: "already_pending" });

    let finalImageUrl = String(imageUrl || "").trim();
    if (!finalImageUrl) {
      const userDoc = await db.collection("users").findOne({ clerkUserId });
      finalImageUrl = userDoc?.profile?.avatar?.url || "";
    }

    await db.collection(parentCol).updateOne(
      { _id: new ObjectId(eventId) },
      {
        $push: {
          pendingRequests: {
            clerkUserId,
            name: String(name).trim(),
            email: String(email || ""),
            phone: String(phone || ""),
            message: String(message || ""),
            imageUrl: finalImageUrl,
            requestedAt: new Date(),
          },
        } as any,
        $set: { updatedAt: new Date() },
      }
    );

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}