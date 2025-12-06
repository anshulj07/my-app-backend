import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { z } from "zod";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

const LocationSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),

  formattedAddress: z.string().max(300).optional().default(""),
  placeId: z.string().max(200).optional(),

  countryCode: z.string().min(2).max(2),
  countryName: z.string().max(80).optional().default(""),

  admin1: z.string().max(120).optional().default(""),
  admin1Code: z.string().max(10).optional().default(""),

  city: z.string().min(1).max(120),
  cityKey: z.string().max(140).optional(),

  postalCode: z.string().max(20).optional().default(""),
  neighborhood: z.string().max(120).optional().default(""),

  source: z.enum(["user_typed", "places_autocomplete", "reverse_geocode"]).optional().default("user_typed"),
});

const EventCreateSchema = z
  .object({
    title: z.string().min(1).max(120),
    emoji: z.string().optional().default("📍"),

    // creator (frontend sends creatorClerkId, keep clerkUserId for backward compat)
    creatorClerkId: z.string().optional().default(""),
    clerkUserId: z.string().optional().default(""),

    // kind/pricing
    kind: z.enum(["free", "service"]).optional().default("free"),
    priceCents: z.number().int().nullable().optional().default(null),

    // Preferred: ISO datetime
    startsAt: z.string().datetime().optional(),

    // Backward compatible (optional)
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")).default(""),

    timezone: z.string().max(60).optional().default(""),

    location: LocationSchema,

    tags: z.array(z.string().max(40)).optional().default([]),
    visibility: z.enum(["public", "private"]).optional().default("public"),
  })
  .superRefine((p, ctx) => {
    const creator = (p.creatorClerkId || p.clerkUserId || "").trim();
    if (!creator) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["creatorClerkId"], message: "creatorClerkId is required" });
    }

    if (p.kind === "service") {
      if (p.priceCents == null || p.priceCents <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceCents"],
          message: "priceCents must be > 0 for service events",
        });
      }
    } else {
      // free event -> force null (avoid inconsistent records)
      if (p.priceCents !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceCents"],
          message: "priceCents must be null for free events",
        });
      }
    }
  });

function buildStartsAt(payload: z.infer<typeof EventCreateSchema>) {
  if (payload.startsAt) return new Date(payload.startsAt);

  // Best-effort UTC Date when date/time provided
  if (payload.date && payload.time) {
    const d = new Date(`${payload.date}T${payload.time}:00Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
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
      emoji: payload.emoji ?? "📍",

      creatorClerkId,
      kind: payload.kind,
      priceCents: payload.priceCents,

      timezone: payload.timezone ?? "",

      // Keep both: startsAt (preferred) + date/time (compat)
      startsAt, // can be null
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

    const kind = (searchParams.get("kind") || "").trim(); // "free" | "service"
    const status = (searchParams.get("status") || "").trim(); // "active" etc.

    const nearLat = searchParams.get("nearLat");
    const nearLng = searchParams.get("nearLng");
    const radiusM = searchParams.get("radiusM");

    const query: any = {};

    if (countryCode) query["location.countryCode"] = countryCode;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    if (kind === "free" || kind === "service") query.kind = kind;
    if (status) query.status = status;

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
