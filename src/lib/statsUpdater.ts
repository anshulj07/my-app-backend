import { Db } from "mongodb";
import clientPromise from "../../lib/mongodb";

/**
 * Recalculates all stats for a specific host and updates the user_stats collection.
 */
export async function updateHostStats(clerkUserId: string) {
  const client = await clientPromise;
  const db = client.db("assis_auth");

  // 1. Events + Services Hosted (Total Count)
  const [eventsCount, servicesCount] = await Promise.all([
    db.collection("events").countDocuments({ creatorClerkId: clerkUserId, status: { $ne: "deleted" } }),
    db.collection("services").countDocuments({ creatorClerkId: clerkUserId, status: { $ne: "deleted" } })
  ]);
  const eventsHosted = eventsCount + servicesCount;

  // 2. All hosted items (to compute attendees + earnings)
  const results = await Promise.all([
    db.collection("events").find(
      { creatorClerkId: clerkUserId, status: { $ne: "deleted" } },
      { projection: { attendees: 1, priceCents: 1, kind: 1, startsAt: 1 } }
    ).toArray(),
    db.collection("services").find(
      { creatorClerkId: clerkUserId, status: { $ne: "deleted" } },
      { projection: { attendees: 1, priceCents: 1, kind: 1, startsAt: 1 } }
    ).toArray()
  ]);
  const hostedEvents = results.flat();

  // 3. Attendees: total, repeated, new
  const attendeesSeen = new Map<string, number>();
  let totalAttendees = 0;

  for (const ev of hostedEvents) {
    const evAttendees: any[] = Array.isArray((ev as any).attendees) ? (ev as any).attendees : [];
    for (const a of evAttendees) {
      const aId = String(a.clerkId || a.clerkUserId || "");
      if (!aId) continue;
      totalAttendees++;
      attendeesSeen.set(aId, (attendeesSeen.get(aId) || 0) + 1);
    }
  }

  let repeatedAttendees = 0;
  let newAttendees = 0;
  for (const [, count] of attendeesSeen) {
    if (count > 1) repeatedAttendees++;
    else newAttendees++;
  }

  // 4. Earnings (in paise)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let thisMonthEarning = 0;
  let overallEarning = 0;

  for (const ev of hostedEvents) {
    const kind = String((ev as any).kind || "");
    const pricePaise = Number((ev as any).priceCents ?? 0);
    if ((kind === "paid" || kind === "event_paid") && pricePaise > 0) {
      const evAttendees: any[] = Array.isArray((ev as any).attendees) ? (ev as any).attendees : [];
      // Only count attendees who paid (have razorpayPaymentId)
      const paidCount = evAttendees.filter((a: any) => !!a.razorpayPaymentId).length;
      const eventEarning = pricePaise * paidCount;
      overallEarning += eventEarning;

      // Check month
      const startsAt = (ev as any).startsAt;
      const eventDate = startsAt instanceof Date ? startsAt : (startsAt?.$date ? new Date(startsAt.$date) : (startsAt ? new Date(startsAt) : null));
      if (eventDate && !isNaN(eventDate.getTime()) && eventDate >= startOfMonth) {
        thisMonthEarning += eventEarning;
      }
    }
  }

  // 5. Services (specifically from services collection)
  const serviceEvents = await db.collection("services").find(
    { creatorClerkId: clerkUserId, status: { $ne: "deleted" } },
    { projection: { title: 1, emoji: 1 } }
  ).limit(10).toArray();
  const services = serviceEvents.map((e: any) => `${e.emoji || ""} ${e.title || ""}`.trim());

  // 6. Rating
  const reviewsAgg = await db.collection("reviews").aggregate([
    { $match: { hostId: clerkUserId } },
    { $group: { _id: "$hostId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]).toArray();
  const rating = reviewsAgg[0]?.avgRating ? Number(reviewsAgg[0].avgRating.toFixed(1)) : 0;
  const reviewsCount = reviewsAgg[0]?.count ?? 0;

  // 7. Upsert user_stats
  const stats = {
    clerkUserId,
    eventsHosted,
    totalAttendees,
    repeatedAttendees,
    newAttendees,
    thisMonthEarning,
    overallEarning,
    services,
    rating,
    reviewsCount,
    updatedAt: new Date(),
  };

  await db.collection("user_stats").updateOne(
    { clerkUserId },
    {
      $set: stats,
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  return stats;
}
