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

    // ✅ Fetch from 'events' and 'notifications' (bot alerts)
    const [evDocs, botNotifs] = await Promise.all([
      db.collection("events").find(
        { creatorClerkId: clerkUserId, status: { $nin: ["deleted"] } },
        { projection: { title: 1, emoji: 1, attendees: 1, pendingRequests: 1, joinPolicy: 1 } }
      ).toArray(),
      db.collection("notifications").find(
        { recipientClerkId: clerkUserId }
      ).toArray()
    ]);
    const events = [...evDocs];

    type NotifItem = {
      id: string;
      type: "joined" | "pending" | "bot_alert";
      eventId: string;
      eventTitle: string;
      eventEmoji: string;
      userName: string;
      userClerkId: string;
      userImageUrl: string;
      message: string;
      timestamp: string;
      paid?: boolean; // ✅ Added to track payment status
      flags?: any[];
      moderatorNote?: string;
    };

    const items: NotifItem[] = [];
    const allUserIds = new Set<string>();

    for (const ev of events) {
      for (const a of (ev as any).attendees || []) if (a.clerkId) allUserIds.add(a.clerkId);
      for (const p of (ev as any).pendingRequests || []) if (p.clerkUserId) allUserIds.add(p.clerkUserId);
    }

    // Fetch proper profiles
    const profileDocs = await db.collection("users").find(
      { clerkUserId: { $in: Array.from(allUserIds) } },
      { projection: { clerkUserId: 1, profile: 1, clerk: 1 } }
    ).toArray();

    const profileMap = new Map();
    for (const d of profileDocs) {
      const p = d.profile || {};
      const c = d.clerk || {};
      const firstName = String(p.firstName ?? c.firstName ?? "").trim();
      const lastName = String(p.lastName ?? c.lastName ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim();
      profileMap.set(d.clerkUserId, {
        name: fullName || "Someone",
        imageUrl: p.avatar?.url || p.avatar || c.imageUrl || ""
      });
    }

    for (const ev of events) {
      const eventId = (ev as any)._id.toString();
      const eventTitle = String((ev as any).title || "Event");
      const eventEmoji = String((ev as any).emoji || "📍");

      // Recent joins
      for (const a of ((ev as any).attendees || []).slice(-30)) {
        const timestamp = a.joinedAt ? new Date(a.joinedAt).toISOString() : new Date().toISOString();
        const prof = profileMap.get(a.clerkId) || {};
        items.push({
          id: `join-${eventId}-${a.clerkId}-${timestamp}`,
          type: "joined",
          eventId, eventTitle, eventEmoji,
          userName: prof.name || String(a.name || "Someone"),
          userClerkId: String(a.clerkId || ""),
          userImageUrl: prof.imageUrl || String(a.imageUrl || ""),
          message: String(a.message || ""),
          timestamp,
          paid: !!a.razorpayPaymentId,
        });
      }

      // Pending approval requests
      for (const p of ((ev as any).pendingRequests || [])) {
        const timestamp = p.requestedAt ? new Date(p.requestedAt).toISOString() : new Date().toISOString();
        const prof = profileMap.get(p.clerkUserId) || {};
        items.push({
          id: `pending-${eventId}-${p.clerkUserId}-${timestamp}`,
          type: "pending",
          eventId, eventTitle, eventEmoji,
          userName: prof.name || String(p.name || "Someone"),
          userClerkId: String(p.clerkUserId || ""),
          userImageUrl: prof.imageUrl || String(p.imageUrl || ""),
          message: String(p.message || ""),
          timestamp,
          paid: !!p.paid,
        });
      }
    }

    // Bot notifications
    for (const n of botNotifs) {
      if (n.type === "event_rejected" || n.type === "service_rejected" || n.type === "event_approved" || n.type === "service_approved") {
        const isApproved = n.type.includes("approved");
        items.push({
          id: n._id.toString(),
          type: "bot_alert",
          eventId: n.eventId || n.serviceId || "",
          eventTitle: n.eventTitle || "Your Listing",
          eventEmoji: isApproved ? "✅" : "⚠️",
          userName: "AI Moderator",
          userClerkId: "bot",
          userImageUrl: "",
          message: n.message || (isApproved ? "Your listing was approved." : "Your listing was rejected."),
          timestamp: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
          flags: n.flags || [],
          moderatorNote: n.moderatorNote || "",
          isApproved,
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