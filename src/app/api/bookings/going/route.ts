// app/api/bookings/going/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const reqId = Math.random().toString(36).slice(2, 8);

  try {
    const { searchParams } = new URL(req.url);
    const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
    const limitRaw = (searchParams.get("limit") || "200").trim();
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 200, 1), 1000);

    console.log(`[going:${reqId}] clerkUserId=`, clerkUserId, "limit=", limit);

    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    // ✅ Correct query for attendees stored as objects
    const query = { "attendees.clerkId": clerkUserId };
    console.log(`[going:${reqId}] query=`, query);

    const events = await db
      .collection("events")
      .find(query, {
        projection: {
          title: 1,
          emoji: 1,
          description: 1,
          creatorClerkId: 1,
          kind: 1,
          priceCents: 1,
          startsAt: 1,
          date: 1,
          time: 1,
          status: 1,
          attendance: 1,
          attendees: 1,
          location: 1,
        },
      })
      .sort({ startsAt: 1, date: 1, time: 1 })
      .limit(limit)
      .toArray();

    console.log(`[going:${reqId}] matchedCount=`, events.length);

    return NextResponse.json({ ok: true, goingEvents: events });
  } catch (e: any) {
    console.error(`[going] error=`, e);
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
