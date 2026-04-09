// app/api/events/notifications/route.ts
// Returns activity feed for host: recent joins + pending approval requests
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

function requireApiKey(req: Request) {
  const key = process.env.EVENT_API_KEY;
  if (!key) return null;
  return req.headers.get("x-api-key") === key
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const guard = requireApiKey(req);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const clerkUserId = searchParams.get("clerkUserId")?.trim();
    if (!clerkUserId)
      return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const events = await db.collection("events")
      .find(
        { creatorClerkId: clerkUserId, status: { $nin: ["deleted"] } },
        { projection: { title: 1, emoji: 1, attendees: 1, pendingRequests: 1, joinPolicy: 1 } }
      )
      .toArray();

    type NotifItem = {
      id: string;
      type: "joined" | "pending";
      eventId: string;
      eventTitle: string;
      eventEmoji: string;
      userName: string;
      userClerkId: string;
      userImageUrl: string;
      message: string;
      timestamp: string;
      paid?: boolean; // ✅ Added to track payment status
    };

    const items: NotifItem[] = [];

    for (const ev of events) {
      const eventId = (ev as any)._id.toString();
      const eventTitle = String((ev as any).title || "Event");
      const eventEmoji = String((ev as any).emoji || "📍");

      // Recent joins (last 30 per event) - confirmed attendees
      for (const a of ((ev as any).attendees || []).slice(-30)) {
        items.push({
          id: `join-${eventId}-${a.clerkId}`,
          type: "joined",
          eventId, eventTitle, eventEmoji,
          userName: String(a.name || "Someone"),
          userClerkId: String(a.clerkId || ""),
          userImageUrl: String(a.imageUrl || ""),
          message: String(a.message || ""),
          timestamp: a.joinedAt ? new Date(a.joinedAt).toISOString() : new Date().toISOString(),
          paid: !!a.razorpayPaymentId, // If payment ID exists, it's paid
        });
      }

      // Pending approval requests - not yet attendees
      for (const p of ((ev as any).pendingRequests || [])) {
        items.push({
          id: `pending-${eventId}-${p.clerkUserId}`,
          type: "pending",
          eventId, eventTitle, eventEmoji,
          userName: String(p.name || "Someone"),
          userClerkId: String(p.clerkUserId || ""),
          userImageUrl: String(p.imageUrl || ""),
          message: String(p.message || ""),
          timestamp: p.requestedAt ? new Date(p.requestedAt).toISOString() : new Date().toISOString(),
          paid: !!p.paid, // ✅ reflecting the new 'paid' flag from verify-payment
        });
      }
    }

    // Sort: pending first, then by recency
    items.sort((a, b) => {
      if (a.type === "pending" && b.type !== "pending") return -1;
      if (b.type === "pending" && a.type !== "pending") return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({
      ok: true,
      items,
      pendingCount: items.filter(i => i.type === "pending").length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}