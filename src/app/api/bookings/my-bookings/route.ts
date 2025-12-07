// app/api/bookings/my-bookings/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null; // if you don't set a key, route is public
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function safeDateFromEvent(e: any): Date | null {
  // Preferred: startsAt
  if (e?.startsAt) {
    const d = new Date(e.startsAt);
    if (Number.isFinite(d.getTime())) return d;
  }

  // Compat: date + time (stored UTC with Z)
  const date = typeof e?.date === "string" ? e.date : "";
  const time = typeof e?.time === "string" ? e.time : "";

  if (date && time) {
    const d = new Date(`${date}T${time}:00Z`);
    if (Number.isFinite(d.getTime())) return d;
  }

  // Compat: date only
  if (date) {
    const d = new Date(`${date}T12:00:00Z`);
    if (Number.isFinite(d.getTime())) return d;
  }

  return null;
}

function normalizeEvent(e: any) {
  const _id = e?._id?.toString?.() ?? String(e?._id ?? "");
  const startsAtIso =
    e?.startsAt && Number.isFinite(new Date(e.startsAt).getTime())
      ? new Date(e.startsAt).toISOString()
      : null;

  return {
    ...e,
    _id,
    startsAt: startsAtIso, // normalize to ISO string (or null)
  };
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);

    const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    const createdRaw = await db
      .collection("events")
      .find({ creatorClerkId: clerkUserId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const createdEvents = createdRaw.map(normalizeEvent);

    // placeholders for now
    const goingEvents: any[] = [];
    const pastEvents: any[] = [];

    // optional: you can split created into past/upcoming for UI if you want
    // (kept here because you already had the helper)
    const now = Date.now();
    const createdUpcoming = createdEvents.filter((e) => (safeDateFromEvent(e)?.getTime() ?? 9e15) >= now);
    const createdPast = createdEvents.filter((e) => (safeDateFromEvent(e)?.getTime() ?? 9e15) < now);

    return NextResponse.json(
      {
        ok: true,

        // main list you need
        createdEvents,

        // optional convenience splits (use or ignore on frontend)
        createdUpcoming,
        createdPast,

        // placeholders
        goingEvents,
        pastEvents,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
