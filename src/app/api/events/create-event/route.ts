// app/api/events/create-event/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { EventCreateSchema, buildStartsAt, normKey } from "../../../../../lib/eventSchema/eventDefault";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json();
    const parsed = EventCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;

    const creatorClerkId = (payload.creatorClerkId || payload.clerkUserId || "").trim();
    const cityKey = payload.location.cityKey?.trim() ? payload.location.cityKey : normKey(payload.location.city);
    const startsAt = buildStartsAt(payload);
    const now = new Date();

    const doc = {
      title: payload.title,
      description: (payload.description ?? "").trim(),
      emoji: payload.emoji ?? "📍",

      creatorClerkId,
      kind: payload.kind,
      priceCents: payload.priceCents,

      // ✅ renamed
      attendance: payload.attendance, // null => open event

      // ✅ store joiners here (start empty)
      // Even if client sends attendees, we force it to []
      attendees: [] as string[],

      timezone: payload.timezone ?? "",

      startsAt,
      date: payload.date ?? "",
      time: payload.time ?? "",

      tags: payload.tags ?? [],
      visibility: payload.visibility ?? "public",
      status: "active" as const,

      location: {
        lat: payload.location.lat,
        lng: payload.location.lng,

        geo: { type: "Point" as const, coordinates: [payload.location.lng, payload.location.lat] },

        formattedAddress: payload.location.formattedAddress ?? "",
        placeId: payload.location.placeId ?? "",

        countryCode: payload.location.countryCode.toUpperCase(),
        countryName: payload.location.countryName ?? "",

        admin1: payload.location.admin1 ?? "",
        admin1Code: payload.location.admin1Code ?? "",

        city: payload.location.city,
        cityKey,

        postalCode: payload.location.postalCode ?? "",
        neighborhood: payload.location.neighborhood ?? "",

        source: payload.location.source ?? "user_typed",
      },

      createdAt: now,
      updatedAt: now,
    };

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    const res = await db.collection("events").insertOne(doc);

    return NextResponse.json(
      { ok: true, id: res.insertedId.toString(), event: { ...doc, _id: res.insertedId.toString() } },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);

    const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

    const countryCode = (searchParams.get("country") || "").trim().toUpperCase();
    const admin1 = (searchParams.get("admin1") || "").trim();
    const city = (searchParams.get("city") || "").trim();
    const cityKey = (searchParams.get("cityKey") || (city ? normKey(city) : "")).trim();

    const kind = (searchParams.get("kind") || "").trim(); // "free" | "paid" | "service"
    const status = (searchParams.get("status") || "").trim();
    const visibility = (searchParams.get("visibility") || "").trim(); // "public" | "private"

    const nearLat = searchParams.get("nearLat");
    const nearLng = searchParams.get("nearLng");
    const radiusM = searchParams.get("radiusM");

    const query: any = {};

    if (countryCode) query["location.countryCode"] = countryCode;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    if (kind === "free" || kind === "paid" || kind === "service") query.kind = kind;
    if (status) query.status = status;
    if (visibility === "public" || visibility === "private") query.visibility = visibility;

    if (nearLat && nearLng) {
      const lat = Number(nearLat);
      const lng = Number(nearLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        query["location.geo"] = {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            ...(radiusM && Number.isFinite(Number(radiusM)) ? { $maxDistance: Number(radiusM) } : {}),
          },
        };
      }
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    const events = await db.collection("events").find(query).sort({ createdAt: -1 }).limit(limit).toArray();

    return NextResponse.json({
      ok: true,
      events: events.map((e: any) => ({ ...e, _id: e._id.toString() })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
