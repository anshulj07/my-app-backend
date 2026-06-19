// // app/api/events/notifications/route.ts
// // Returns activity feed for host: recent joins + pending approval requests
// //D:\mYapp1\backend\src\app\api\events\notifications\route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";

// function requireApiKey(req: Request) {
//   const key = process.env.EVENT_API_KEY;
//   if (!key) return null;
//   return req.headers.get("x-api-key") === key
//     ? null
//     : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// export async function GET(req: Request) {
//   const guard = requireApiKey(req);
//   if (guard) return guard;

//   try {
//     const { searchParams } = new URL(req.url);
//     const clerkUserId = searchParams.get("clerkUserId")?.trim();
//     if (!clerkUserId)
//       return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });

//     const client = await clientPromise;
//     const db = client.db("assis_auth");

//     // ✅ Fetch from both 'events' and 'services'
//     const [evDocs, svDocs] = await Promise.all([
//       db.collection("events").find(
//         { creatorClerkId: clerkUserId, status: { $nin: ["deleted"] } },
//         { projection: { title: 1, emoji: 1, attendees: 1, pendingRequests: 1, joinPolicy: 1 } }
//       ).toArray(),
//       db.collection("services").find(
//         { creatorClerkId: clerkUserId, status: { $nin: ["deleted"] } },
//         { projection: { title: 1, emoji: 1, attendees: 1, pendingRequests: 1, joinPolicy: 1 } }
//       ).toArray()
//     ]);
//     const events = [...evDocs, ...svDocs];

//     type NotifItem = {
//       id: string;
//       type: "joined" | "pending";
//       eventId: string;
//       eventTitle: string;
//       eventEmoji: string;
//       userName: string;
//       userClerkId: string;
//       userImageUrl: string;
//       message: string;
//       timestamp: string;
//       paid?: boolean; // ✅ Added to track payment status
//     };

//     const items: NotifItem[] = [];

//     for (const ev of events) {
//       const eventId = (ev as any)._id.toString();
//       const eventTitle = String((ev as any).title || "Event");
//       const eventEmoji = String((ev as any).emoji || "📍");

//       // Recent joins (last 30 per event) - confirmed attendees
//       for (const a of ((ev as any).attendees || []).slice(-30)) {
//         const timestamp = a.joinedAt ? new Date(a.joinedAt).toISOString() : new Date().toISOString();
//         items.push({
//           id: `join-${eventId}-${a.clerkId}-${timestamp}`,
//           type: "joined",
//           eventId, eventTitle, eventEmoji,
//           userName: String(a.name || "Someone"),
//           userClerkId: String(a.clerkId || ""),
//           userImageUrl: String(a.imageUrl || ""),
//           message: String(a.message || ""),
//           timestamp,
//           paid: !!a.razorpayPaymentId,
//         });
//       }

//       // Pending approval requests - not yet attendees
//       for (const p of ((ev as any).pendingRequests || [])) {
//         const timestamp = p.requestedAt ? new Date(p.requestedAt).toISOString() : new Date().toISOString();
//         items.push({
//           id: `pending-${eventId}-${p.clerkUserId}-${timestamp}`,
//           type: "pending",
//           eventId, eventTitle, eventEmoji,
//           userName: String(p.name || "Someone"),
//           userClerkId: String(p.clerkUserId || ""),
//           userImageUrl: String(p.imageUrl || ""),
//           message: String(p.message || ""),
//           timestamp,
//           paid: !!p.paid,
//         });
//       }
//     }

//     // Sort: pending first, then by recency
//     items.sort((a, b) => {
//       if (a.type === "pending" && b.type !== "pending") return -1;
//       if (b.type === "pending" && a.type !== "pending") return 1;
//       return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
//     });

//     return NextResponse.json({
//       ok: true,
//       items,
//       pendingCount: items.filter(i => i.type === "pending").length,
//     });
//   } catch (e: any) {
//     return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
//   }
// }
// app/api/events/notifications/route.ts
// Returns activity feed for host:
//   - recent joins + pending approval requests (events/services)
//   - moderation approved/rejected notifications (NEW)

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

    // ── Fetch events + services for host activity feed ──────────────────────
    const [evDocs, svDocs] = await Promise.all([
      db.collection("events").find(
        { creatorClerkId: clerkUserId, status: { $nin: ["deleted"] } },
        { projection: { title: 1, emoji: 1, attendees: 1, pendingRequests: 1, joinPolicy: 1 } }
      ).toArray(),
      db.collection("services").find(
        { creatorClerkId: clerkUserId, status: { $nin: ["deleted"] } },
        { projection: { title: 1, emoji: 1, attendees: 1, pendingRequests: 1, joinPolicy: 1 } }
      ).toArray()
    ]);
    const events = [...evDocs, ...svDocs];

    type NotifItem = {
      id: string;
      type: "joined" | "pending" | "moderation_approved" | "moderation_rejected";
      eventId: string;
      eventTitle: string;
      eventEmoji: string;
      userName: string;
      userClerkId: string;
      userImageUrl: string;
      message: string;
      timestamp: string;
      paid?: boolean;
      // moderation-specific
      approvalStatus?: string | null;
      riskScore?: number | null;
      moderatorNote?: string | null;
      moderationRead?: boolean;
      moderationId?: string;
      flags?: string[];
    };

    const items: NotifItem[] = [];

    // ── Host activity: joins + pending ──────────────────────────────────────
    for (const ev of events) {
      const eventId = (ev as any)._id.toString();
      const eventTitle = String((ev as any).title || "Event");
      const eventEmoji = String((ev as any).emoji || "📍");

      for (const a of ((ev as any).attendees || []).slice(-30)) {
        const timestamp = a.joinedAt
          ? new Date(a.joinedAt).toISOString()
          : new Date().toISOString();
        items.push({
          id: `join-${eventId}-${a.clerkId}-${timestamp}`,
          type: "joined",
          eventId, eventTitle, eventEmoji,

          userName: String(a.name || "Someone"),
          userClerkId: String(a.clerkId || ""),
          userImageUrl: String(a.imageUrl || ""),
          message: String(a.message || ""),
          timestamp,
          paid: !!a.razorpayPaymentId,
        });
      }

      for (const p of ((ev as any).pendingRequests || [])) {
        const timestamp = p.requestedAt
          ? new Date(p.requestedAt).toISOString()
          : new Date().toISOString();
        items.push({
          id: `pending-${eventId}-${p.clerkUserId}-${timestamp}`,
          type: "pending",
          eventId, eventTitle, eventEmoji,
          userName: String(p.name || "Someone"),
          userClerkId: String(p.clerkUserId || ""),
          userImageUrl: String(p.imageUrl || ""),
          message: String(p.message || ""),
          timestamp,
          paid: !!p.paid,
        });
      }
    }

    // ── Moderation notifications (approved/rejected) ─────────────────────────
    // notifications collection se fetch karo — same collection jo popup use karta hai
    // Yahan bhi dikhao taaki user NotificationSheet mein bhi dekh sake
    const moderationNotifs = await db
      .collection("notifications")
      .find({
        recipientClerkId: clerkUserId,
        type: {
          $in: [
            "event_approved", "event_rejected",
            "service_approved", "service_rejected",
          ],
        },
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    for (const n of moderationNotifs) {
      const isApproved =
        n.type === "event_approved" || n.type === "service_approved";
      const isService =
        n.type === "service_approved" || n.type === "service_rejected";

      items.push({
        id: `moderation-${n._id.toString()}`,
        type: isApproved ? "moderation_approved" : "moderation_rejected",
        eventId: n.eventId || n.serviceId || "",
        eventTitle: String(n.eventTitle || "Your listing"),
        eventEmoji: isService ? "🛠️" : "📅",
        userName: "",
        userClerkId: "",
        userImageUrl: "",
        message: String(n.message || ""),approvalStatus: (n.approvalStatus as any) || null,
riskScore: n.riskScore || null,
        timestamp: n.createdAt
          ? new Date(n.createdAt).toISOString()
          : new Date().toISOString(),
        // moderatorNote = rejection reason / AI bot reason
        moderatorNote: n.moderatorNote || null,
       flags: Array.isArray(n.flags) ? n.flags : [],   // ← ADD
        moderationRead: !!n.read,
        moderationId: n._id.toString(),
      });
    }

    // ── Sort: pending first → moderation_rejected → rest by recency ──────────
    items.sort((a, b) => {
      // Priority 1: pending join requests
      if (a.type === "pending" && b.type !== "pending") return -1;
      if (b.type === "pending" && a.type !== "pending") return 1;
      // Priority 2: unread moderation rejections
      if (
        a.type === "moderation_rejected" && !a.moderationRead &&
        !(b.type === "moderation_rejected" && !b.moderationRead)
      ) return -1;
      if (
        b.type === "moderation_rejected" && !b.moderationRead &&
        !(a.type === "moderation_rejected" && !a.moderationRead)
      ) return 1;
      // Rest by recency
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