// app/api/events/update-event/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  placeId: z.string().max(200).optional().default(""),

  countryCode: z.string().min(2).max(2),
  countryName: z.string().max(80).optional().default(""),

  admin1: z.string().max(120).optional().default(""),
  admin1Code: z.string().max(10).optional().default(""),

  city: z.string().min(1).max(120),
  cityKey: z.string().max(140).optional().default(""),

  postalCode: z.string().max(20).optional().default(""),
  neighborhood: z.string().max(120).optional().default(""),

  source: z
    .enum(["user_typed", "places_autocomplete", "reverse_geocode", "user_edit", "db"])
    .optional()
    .default("user_edit"),
});

const PatchFieldsSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    emoji: z.string().optional(),

    // ✅ description
    description: z.string().max(2000).optional(),

    // ✅ accept both old + new kinds for backward compatibility
    // - old: "free" | "service"
    // - new: "event_free" | "event_paid" | "service"
    kind: z.enum(["free", "service", "event_free", "event_paid"]).optional(),

    priceCents: z.number().int().nullable().optional(),

    // ✅ Preferred: ISO datetime
    startsAt: z.string().datetime().optional(),

    // ✅ Compat
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")).optional(),

    timezone: z.string().max(60).optional(),

    location: LocationSchema.optional(),

    tags: z.array(z.string().max(40)).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    status: z.enum(["active", "cancelled"]).optional(),
  })
  .partial();

const UpdateEventSchema = z
  .object({
    _id: z.string().min(1),
    eventId: z.string().optional(), // compat

    creatorClerkId: z.string().optional().default(""),
    clerkUserId: z.string().optional().default(""),

    // allow both shapes: {updates:{...}} and/or flat fields
    updates: PatchFieldsSchema.optional(),
  })
  .and(PatchFieldsSchema.partial());

function buildStartsAtFromDateTime(date?: string, time?: string) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00Z`); // matches create-event behavior
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Normalize kinds so DB stays consistent:
 * - "event_free" -> "free"
 * - "event_paid" -> "event_paid" (kept distinct; treat as paid requiring price)
 * - "free" -> "free"
 * - "service" -> "service"
 */
function normalizeKind(kind?: string) {
  if (!kind) return undefined;
  if (kind === "event_free") return "free";
  if (kind === "event_paid") return "event_paid";
  if (kind === "free") return "free";
  if (kind === "service") return "service";
  return undefined;
}

export async function PATCH(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json();
    const parsed = UpdateEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    const u = payload.updates ?? {};

    // ✅ merge: updates wins over flat
    const title = (u.title ?? payload.title)?.trim();
    const emoji = (u.emoji ?? payload.emoji) ?? undefined;
    const description = (u.description ?? payload.description) ?? undefined;

    const rawKind = (u.kind ?? payload.kind) ?? undefined;
    const kind = normalizeKind(rawKind);

    const priceCents = u.priceCents ?? payload.priceCents;

    const date = u.date ?? payload.date;
    const time = u.time ?? payload.time;
    const timezone = u.timezone ?? payload.timezone;

    const startsAtStr = u.startsAt ?? payload.startsAt;
    const location = u.location ?? payload.location;

    const tags = u.tags ?? payload.tags;
    const visibility = u.visibility ?? payload.visibility;
    const status = u.status ?? payload.status;

    const creator = (payload.creatorClerkId || payload.clerkUserId || "").trim();
    if (!creator) {
      return NextResponse.json({ error: "creatorClerkId is required" }, { status: 400 });
    }

    // ✅ validate _id early
    const _oid = ObjectId.isValid(payload._id) ? new ObjectId(payload._id) : null;
    if (!_oid) return NextResponse.json({ error: "Invalid event id (_id)" }, { status: 400 });

    // ✅ kind/price rules
    // Paid kinds require valid price
    if (kind === "service" || kind === "event_paid") {
      if (priceCents == null || typeof priceCents !== "number" || priceCents <= 0) {
        return NextResponse.json({ error: "priceCents must be > 0 when kind=service/event_paid" }, { status: 400 });
      }
    }

    // Free kind must not carry price
    if (kind === "free" && typeof priceCents !== "undefined" && priceCents !== null) {
      return NextResponse.json({ error: "priceCents must be null when kind=free (or omit priceCents)" }, { status: 400 });
    }

    // ✅ build $set only for provided fields
    const $set: Record<string, any> = { updatedAt: new Date() };

    if (typeof title !== "undefined") $set.title = title;
    if (typeof emoji !== "undefined") $set.emoji = emoji;
    if (typeof description !== "undefined") $set.description = description;

    if (typeof kind !== "undefined") {
      $set.kind = kind;
      if (kind === "free") $set.priceCents = null; // enforce consistency
    }

    // If priceCents explicitly provided, set it. (Kind rules above already validate.)
    if (typeof priceCents !== "undefined") $set.priceCents = priceCents;

    if (typeof timezone !== "undefined") $set.timezone = timezone ?? "";

    if (typeof date !== "undefined") $set.date = date ?? "";
    if (typeof time !== "undefined") $set.time = time ?? "";

    // ✅ startsAt handling:
    // - if startsAt provided: trust it
    // - else if date/time patched: recompute best-effort (requires db fetch to combine with existing)
    if (typeof startsAtStr !== "undefined") {
      const d = startsAtStr ? new Date(startsAtStr) : null;
      if (d && !Number.isFinite(d.getTime())) {
        return NextResponse.json({ error: "Invalid startsAt" }, { status: 400 });
      }
      $set.startsAt = d;
    } else {
      const dateTouched = typeof (u.date ?? payload.date) !== "undefined";
      const timeTouched = typeof (u.time ?? payload.time) !== "undefined";

      if (dateTouched || timeTouched) {
        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB || "myApp");

        const existing = await db.collection("events").findOne(
          { _id: _oid, creatorClerkId: creator },
          { projection: { date: 1, time: 1 } }
        );

        if (!existing) {
          return NextResponse.json({ error: "Event not found or you are not the creator" }, { status: 404 });
        }

        const nextDate = typeof date !== "undefined" ? (date ?? "") : (existing as any).date ?? "";
        const nextTime = typeof time !== "undefined" ? (time ?? "") : (existing as any).time ?? "";

        const computed = buildStartsAtFromDateTime(nextDate, nextTime);
        if (computed) $set.startsAt = computed;
      }
    }

    if (typeof tags !== "undefined") $set.tags = tags ?? [];
    if (typeof visibility !== "undefined") $set.visibility = visibility ?? "public";
    if (typeof status !== "undefined") $set.status = status ?? "active";

    if (typeof location !== "undefined") {
      if (!location) {
        return NextResponse.json({ error: "location cannot be null" }, { status: 400 });
      }
      const locParsed = LocationSchema.safeParse(location);
      if (!locParsed.success) {
        return NextResponse.json({ error: "Invalid location", details: locParsed.error.flatten() }, { status: 400 });
      }

      const loc = locParsed.data;
      const cityKey = loc.cityKey?.trim() ? loc.cityKey : normKey(loc.city);

      $set.location = {
        ...loc,
        cityKey,
        countryCode: loc.countryCode.toUpperCase(),
        geo: { type: "Point", coordinates: [loc.lng, loc.lat] },
      };
    }

    // ✅ prevent empty patch
    const keys = Object.keys($set).filter((k) => k !== "updatedAt");
    if (keys.length === 0) {
      return NextResponse.json({ error: "No fields provided to update" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    // ✅ only creator can update
    const findQuery = { _id: _oid, creatorClerkId: creator };

    const upd = await db.collection("events").updateOne(findQuery, { $set });

    if (upd.matchedCount === 0) {
      return NextResponse.json({ error: "Event not found or you are not the creator" }, { status: 404 });
    }

    const updated = await db.collection("events").findOne(findQuery);

    return NextResponse.json(
      { ok: true, event: updated ? { ...updated, _id: (updated as any)._id.toString() } : null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
