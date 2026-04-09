// // src/app/api/users/stats/route.ts
// // GET /api/users/stats?clerkUserId=xxx
// // Recalculates ALL user stats from scratch and updates user_stats collection
// // Call this on profile page load or pull-to-refresh for accuracy

// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// function requireApiKey(req: Request) {
//   const apiKeyHeader = req.headers.get("x-api-key") || "";
//   const API_KEY = process.env.EVENT_API_KEY;
//   return !API_KEY || apiKeyHeader !== API_KEY
//     ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
//     : null;
// }

// export async function GET(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const { searchParams } = new URL(req.url);
//     const clerkUserId = String(searchParams.get("clerkUserId") || "").trim();
//     if (!clerkUserId) {
//       return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
//     }

//     const client = await clientPromise;
//     const db = client.db("assis_auth");

//     // ── 1. Events Hosted ─────────────────────────────────────────────────────
//     const eventsHosted = await db.collection("events").countDocuments({
//       creatorClerkId: clerkUserId,
//       status: { $ne: "deleted" },
//     });

//     // ── 2. All hosted events (to compute attendees + earnings) ───────────────
//     const hostedEvents = await db.collection("events").find(
//       { creatorClerkId: clerkUserId, status: { $ne: "deleted" } },
//       { projection: { attendees: 1, priceCents: 1, kind: 1, startsAt: 1 } }
//     ).toArray();

//     // ── 3. Attendees: total, repeated, new ───────────────────────────────────
//     const attendeesSeen = new Map<string, number>(); // clerkId → how many times they attended
//     let totalAttendees = 0;

//     for (const ev of hostedEvents) {
//       const evAttendees: any[] = Array.isArray((ev as any).attendees) ? (ev as any).attendees : [];
//       for (const a of evAttendees) {
//         const aId = String(a.clerkId || a.clerkUserId || "");
//         if (!aId) continue;
//         totalAttendees++;
//         attendeesSeen.set(aId, (attendeesSeen.get(aId) || 0) + 1);
//       }
//     }

//     let repeatedAttendees = 0;
//     let newAttendees = 0;
//     for (const [, count] of attendeesSeen) {
//       if (count > 1) repeatedAttendees++;
//       else newAttendees++;
//     }

//     // ── 4. Earnings ──────────────────────────────────────────────────────────
//     const now = new Date();
//     const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//     let thisMonthEarning = 0;
//     let overallEarning = 0;

//     for (const ev of hostedEvents) {
//       const kind = String((ev as any).kind || "");
//       const pricePaise = Number((ev as any).priceCents ?? 0);
//       if ((kind === "paid" || kind === "event_paid") && pricePaise > 0) {
//         const evAttendees: any[] = Array.isArray((ev as any).attendees) ? (ev as any).attendees : [];
//         // Only count attendees who paid (have razorpayPaymentId)
//         const paidCount = evAttendees.filter((a: any) => !!a.razorpayPaymentId).length;
//         const eventEarning = pricePaise * paidCount;
//         overallEarning += eventEarning;

//         // Check if this event is this month
//         const startsAt = (ev as any).startsAt;
//         const eventDate = startsAt instanceof Date ? startsAt : (startsAt?.$date ? new Date(startsAt.$date) : null);
//         if (eventDate && eventDate >= startOfMonth) {
//           thisMonthEarning += eventEarning;
//         }
//       }
//     }

//     // ── 5. Services (event titles with kind=service) ──────────────────────────
//     const serviceEvents = await db.collection("events").find(
//       { creatorClerkId: clerkUserId, kind: "service", status: { $ne: "deleted" } },
//       { projection: { title: 1, emoji: 1 } }
//     ).limit(10).toArray();
//     const services = serviceEvents.map((e: any) => `${e.emoji || ""} ${e.title || ""}`.trim());

//     // ── 6. Rating (from reviews collection) ──────────────────────────────────
//     const reviewsAgg = await db.collection("reviews").aggregate([
//       { $match: { hostId: clerkUserId } },
//       { $group: { _id: "$hostId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
//     ]).toArray();
//     const rating = reviewsAgg[0]?.avgRating ? Number(reviewsAgg[0].avgRating.toFixed(1)) : 0;
//     const reviewsCount = reviewsAgg[0]?.count ?? 0;

//     // ── 7. Upsert user_stats ──────────────────────────────────────────────────
//     await db.collection("user_stats").updateOne(
//       { clerkUserId },
//       {
//         $set: {
//           clerkUserId,
//           eventsHosted,
//           totalAttendees,
//           repeatedAttendees,
//           newAttendees,
//           thisMonthEarning,
//           overallEarning,
//           services,
//           rating,
//           reviewsCount,
//           updatedAt: new Date(),
//         },
//         $setOnInsert: { createdAt: new Date() },
//       },
//       { upsert: true }
//     );

//     return NextResponse.json({
//       ok: true,
//       eventsHosted,
//       totalAttendees,
//       repeatedAttendees,
//       newAttendees,
//       thisMonthEarning,
//       overallEarning,
//       services,
//       rating,
//       reviewsCount,
//     }, { headers: { "Cache-Control": "no-store" } });
//   } catch (e: any) {
//     console.error("GET /api/users/stats failed:", e);
//     return NextResponse.json({ error: "Internal Server Error", detail: e?.message ?? "" }, { status: 500 });
//   }
// }









import { NextResponse } from "next/server";
import { updateHostStats } from "../../../../../lib/statsUpdater";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY;
  return !API_KEY || apiKeyHeader !== API_KEY
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : null;
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const clerkUserId = String(searchParams.get("clerkUserId") || "").trim();
    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const stats = await updateHostStats(clerkUserId);

    return NextResponse.json(
      {
        ok: true,
        ...stats
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("GET /api/users/stats failed:", e);
    return NextResponse.json(
      { error: "Internal Server Error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}