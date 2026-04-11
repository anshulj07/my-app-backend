// src/app/api/reviews/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET: Check if user already rated an event ──────────────────────────────
export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const eventId    = (searchParams.get("eventId")    || "").trim();
    const reviewerId = (searchParams.get("reviewerId") || "").trim();
    const hostId     = (searchParams.get("hostId")     || "").trim();

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // If no reviewerId, return all reviews for eventId (for host summary)
    if (!reviewerId && eventId) {
      const allReviews = await db.collection("reviews")
        .find({ eventId })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();
      
      return NextResponse.json({
        ok: true,
        count: allReviews.length,
        reviews: allReviews.map(r => ({
          rating:    r.rating,
          comment:   r.comment || "",
          images:    r.images || [],
          createdAt: r.createdAt,
          reviewerId: r.reviewerId, // To link with attendee names if needed
        })),
      });
    }

    if (!reviewerId) {
      return NextResponse.json({ error: "reviewerId required" }, { status: 400 });
    }

    const query: any = { reviewerId };
    if (eventId)  query.eventId = eventId;
    if (hostId)   query.hostId  = hostId;

    const existing = await db.collection("reviews").findOne(query);

    return NextResponse.json({
      ok: true,
      hasRated: !!existing,
      review: existing ? {
        rating:  existing.rating,
        comment: existing.comment || "",
      } : null,
    });
  } catch (e: any) {
    console.error("GET /api/reviews failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Error" }, { status: 500 });
  }
}

// ── POST: Submit a review ──────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const hostId     = String(body.hostId     || "").trim();
    const reviewerId = String(body.reviewerId || "").trim();
    const eventId    = String(body.eventId    || "").trim();
    const rating     = Number(body.rating);
    const comment    = String(body.comment    || "").trim().slice(0, 300);
    const images     = Array.isArray(body.images) ? body.images.filter(img => typeof img === "string") : [];

    if (!hostId || !reviewerId || isNaN(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Invalid review data" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // ── Duplicate check ─────────────────────────────────────────────────
    const dupQuery: any = { hostId, reviewerId };
    if (eventId) dupQuery.eventId = eventId;
    const existing = await db.collection("reviews").findOne(dupQuery);
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyRated: true,
        rating: existing.rating,
        message: "You already rated this event",
      });
    }

    // ── Save review ──────────────────────────────────────────────────────
    await db.collection("reviews").insertOne({
      hostId,
      reviewerId,
      eventId:   eventId || null,
      rating,
      comment,
      images,
      createdAt: new Date(),
    });

    // ── Recalculate host average ─────────────────────────────────────────
    const stats = await db.collection("reviews").aggregate([
      { $match: { hostId } },
      { $group: { _id: "$hostId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]).toArray();

    const newAvg   = stats[0]?.avgRating || 0;
    const newCount = stats[0]?.count     || 0;

    await db.collection("user_stats").updateOne(
      { clerkUserId: hostId },
      {
        $set: {
          rating:       Number(newAvg.toFixed(1)),
          reviewsCount: newCount,
          updatedAt:    new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, rating: newAvg, count: newCount });
  } catch (e: any) {
    console.error("POST /api/reviews failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Error" }, { status: 500 });
  }
}
