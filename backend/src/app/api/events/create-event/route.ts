// // // app/api/events/create-event/route.ts
// // import { NextResponse } from "next/server";
// // import clientPromise from "../../../../../lib/mongodb";
// // import { EventCreateSchema, buildStartsAt, normKey } from "../../../../../lib/eventSchema/eventDefault";

// // function requireApiKey(req: Request) {
// //   const expected = process.env.EVENT_API_KEY;
// //   if (!expected) return null;
// //   const got = req.headers.get("x-api-key");
// //   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// // }

// // export async function POST(req: Request) {
// //   const auth = requireApiKey(req);
// //   if (auth) return auth;

// //   try {
// //     const body = await req.json();
// //     const parsed = EventCreateSchema.safeParse(body);

// //     if (!parsed.success) {
// //       return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
// //     }

// //     const payload = parsed.data;

// //     const creatorClerkId = (payload.creatorClerkId || payload.clerkUserId || "").trim();
// //     const cityKey = payload.location.cityKey?.trim() ? payload.location.cityKey : normKey(payload.location.city);
// //     const startsAt = buildStartsAt(payload);
// //     const now = new Date();

// //     // ✅ Normalize kind: "event_free" → "free", "event_paid" → "paid"
// //     const rawKind = String(payload.kind || "free");
// //     const kind =
// //       rawKind === "event_free" ? "free" :
// //       rawKind === "event_paid" ? "paid" :
// //       rawKind; // "service" stays as is

// //     // ✅ Service slots — save if kind is service
// //     const slots: string[] = Array.isArray((payload as any).slots) ? (payload as any).slots : [];
// //     const slotDurationMinutes: number | null =
// //       kind === "service" && typeof (payload as any).slotDurationMinutes === "number"
// //         ? (payload as any).slotDurationMinutes
// //         : null;

// //     const doc: Record<string, any> = {
// //       title: payload.title,
// //       description: (payload.description ?? "").trim(),
// //       emoji: payload.emoji ?? "📍",

// //       creatorClerkId,
// //       kind,                         // ✅ normalized: "free" | "paid" | "service"
// //       priceCents: kind === "free" ? null : (payload.priceCents ?? null),

// //       // ✅ joinPolicy — "open" (direct join) or "approval" (host must approve)
// //       joinPolicy: (payload as any).joinPolicy ?? "open",

// //       // ✅ attendance/capacity limit — frontend may send as "capacity" or "attendance"
// //       attendance: (payload as any).capacity ?? payload.attendance ?? null,
// //       attendees: [] as any[],
// //       pendingRequests: [] as any[],

// //       timezone: payload.timezone ?? "",

// //       startsAt,
// //       date: payload.date ?? "",
// //       time: payload.time ?? "",

// //       tags: payload.tags ?? [],
// //       visibility: payload.visibility ?? "public",
// //       status: "active" as const,

// //       location: {
// //         lat: payload.location.lat,
// //         lng: payload.location.lng,

// //         geo: { type: "Point" as const, coordinates: [payload.location.lng, payload.location.lat] },

// //         formattedAddress: payload.location.formattedAddress ?? "",
// //         placeId: payload.location.placeId ?? "",

// //         countryCode: payload.location.countryCode.toUpperCase(),
// //         countryName: payload.location.countryName ?? "",

// //         admin1: payload.location.admin1 ?? "",
// //         admin1Code: payload.location.admin1Code ?? "",

// //         city: payload.location.city,
// //         cityKey,

// //         postalCode: payload.location.postalCode ?? "",
// //         neighborhood: payload.location.neighborhood ?? "",

// //         source: payload.location.source ?? "user_typed",
// //       },

// //       createdAt: now,
// //       updatedAt: now,
// //     };

// //     // ✅ Only add slots fields for service listings
// //     if (kind === "service") {
// //       doc.slots = slots;
// //       doc.slotDurationMinutes = slotDurationMinutes;
// //     }

// //     const client = await clientPromise;
// //     // ✅ FIXED: was "myApp", now "assis_auth" — consistent with rest of app
// //     const db = client.db("assis_auth");

// //     const res = await db.collection("events").insertOne(doc);

// //     // ✅ Track eventsHosted in user_stats
// //     if (creatorClerkId) {
// //       await db.collection("user_stats").updateOne(
// //         { clerkUserId: creatorClerkId },
// //         {
// //           $inc: { eventsHosted: 1 },
// //           $set: { updatedAt: new Date() },
// //           $setOnInsert: {
// //             clerkUserId: creatorClerkId,
// //             totalAttendees: 0,
// //             rating: 0,
// //             reviewsCount: 0,
// //             thisMonthEarning: 0,
// //             overallEarning: 0,
// //             repeatedAttendees: 0,
// //             newAttendees: 0,
// //             createdAt: new Date(),
// //           },
// //         },
// //         { upsert: true }
// //       );
// //     }

// //     return NextResponse.json(
// //       { ok: true, id: res.insertedId.toString(), event: { ...doc, _id: res.insertedId.toString() } },
// //       { status: 201 }
// //     );
// //   } catch (e: any) {
// //     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
// //   }
// // }

// // export async function GET(req: Request) {
// //   const auth = requireApiKey(req);
// //   if (auth) return auth;

// //   try {
// //     const { searchParams } = new URL(req.url);

// //     const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

// //     const countryCode = (searchParams.get("country") || "").trim().toUpperCase();
// //     const admin1 = (searchParams.get("admin1") || "").trim();
// //     const city = (searchParams.get("city") || "").trim();
// //     const cityKey = (searchParams.get("cityKey") || (city ? normKey(city) : "")).trim();

// //     const kind = (searchParams.get("kind") || "").trim();
// //     const status = (searchParams.get("status") || "").trim();
// //     const visibility = (searchParams.get("visibility") || "").trim();

// //     const nearLat = searchParams.get("nearLat");
// //     const nearLng = searchParams.get("nearLng");
// //     const radiusM = searchParams.get("radiusM");

// //     const query: any = {};

// //     if (countryCode) query["location.countryCode"] = countryCode;
// //     if (admin1) query["location.admin1"] = admin1;
// //     if (cityKey) query["location.cityKey"] = cityKey;

// //     if (kind === "free" || kind === "paid" || kind === "service") query.kind = kind;
// //     if (status) query.status = status;
// //     if (visibility === "public" || visibility === "private") query.visibility = visibility;

// //     if (nearLat && nearLng) {
// //       const lat = Number(nearLat);
// //       const lng = Number(nearLng);
// //       if (Number.isFinite(lat) && Number.isFinite(lng)) {
// //         query["location.geo"] = {
// //           $near: {
// //             $geometry: { type: "Point", coordinates: [lng, lat] },
// //             ...(radiusM && Number.isFinite(Number(radiusM)) ? { $maxDistance: Number(radiusM) } : {}),
// //           },
// //         };
// //       }
// //     }

// //     const client = await clientPromise;
// //     // ✅ FIXED: was "myApp"
// //     const db = client.db("assis_auth");

// //     const events = await db.collection("events").find(query).sort({ createdAt: -1 }).limit(limit).toArray();

// //     return NextResponse.json({
// //       ok: true,
// //       events: events.map((e: any) => ({ ...e, _id: e._id.toString() })),
// //     });
// //   } catch (e: any) {
// //     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
// //   }
// // }











// // app/api/events/create-event/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";
// import { EventCreateSchema, buildStartsAt, buildEndsAt } from "../../../../../lib/eventSchema/eventDefault";
// import { INITIAL_USER_STATS } from "../../../../../lib/userSchema/userStatsSchema";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected
//     ? null
//     : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// export async function POST(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const body = await req.json().catch(() => null);
//     if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

//     // ── Validate ──────────────────────────────────────────────────────────────
//     const parsed = EventCreateSchema.safeParse(body);
//     if (!parsed.success) {
//       return NextResponse.json(
//         { error: "Validation failed", details: parsed.error.flatten() },
//         { status: 400 }
//       );
//     }

//     const data = parsed.data;
//     const creatorClerkId = (data.creatorClerkId || data.clerkUserId || "").trim();
//     if (!creatorClerkId) {
//       return NextResponse.json({ error: "creatorClerkId is required" }, { status: 400 });
//     }

//     // ── Build document ────────────────────────────────────────────────────────
//     const startsAt = buildStartsAt(data);
//     const endsAt   = buildEndsAt(data);

//     // Accept capacity from either field name (frontend sends "capacity")
//     const effectiveCapacity = data.attendance ?? data.capacity ?? null;

//     const doc: Record<string, any> = {
//       title:          data.title.trim(),
//       description:    (data.description ?? "").trim(),
//       emoji:          data.emoji ?? "📍",
//       creatorClerkId,
//       creatorName:    body.creatorName || "Local Host",
//       kind:           data.kind ?? "free",
//       priceCents:     data.priceCents ?? null,
//       joinPolicy:     data.joinPolicy ?? "open",
//       attendance:     effectiveCapacity,
//       capacity:       effectiveCapacity,
//       attendees:      [],
//       pendingRequests:[],
//       date:           data.date ?? "",
//       time:           data.time ?? "",
//       endDate:        data.endDate ?? "",
//       endTime:        data.endTime ?? "",
//       timezone:       data.timezone ?? "",
//       tags:           data.tags ?? [],
//       visibility:     data.visibility ?? "public",
//       status:         "active",
//       location: {
//         ...data.location,
//         // GeoJSON for $near queries — requires 2dsphere index
//         geo: {
//           type: "Point",
//           coordinates: [data.location.lng, data.location.lat],
//         },
//       },
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     };

//     // Optional: store bannerUri if sent from frontend
//     if (typeof body.bannerUri === "string" && body.bannerUri.trim()) {
//       doc.bannerUri = body.bannerUri.trim();
//     }

//     if (startsAt) doc.startsAt = startsAt;
//     if (endsAt)   doc.endsAt   = endsAt;

//     // ── Insert document into correct collection ─────────────────────────────
//     const client = await clientPromise;
//     const db = client.db("assis_auth");

//     // ✅ Split collection logic: 'services' for kind service, else 'events'
//     const targetCollection = doc.kind === "service" ? "services" : "events";
//     const result = await db.collection(targetCollection).insertOne(doc);
//     const eventId = result.insertedId.toString();

//     // ── Update user_stats: increment eventsHosted ─────────────────────────────
//     const { eventsHosted, ...initialStats } = INITIAL_USER_STATS;
//     await db.collection("user_stats").updateOne(
//       { clerkUserId: creatorClerkId },
//       {
//         $inc: { eventsHosted: 1 },
//         $set: { updatedAt: new Date() },
//         $setOnInsert: {
//           ...initialStats,
//           clerkUserId: creatorClerkId,
//           createdAt: new Date(),
//         },
//       },
//       { upsert: true }
//     );

//     return NextResponse.json(
//       {
//         ok: true,
//         eventId,
//         event: { ...doc, _id: eventId },
//       },
//       { status: 201 }
//     );
//   } catch (e: any) {
//     console.error("[POST /api/events/create-event]", e);
//     return NextResponse.json(
//       { error: "Server error", detail: e?.message ?? "" },
//       { status: 500 }
//     );
//   }
// }




// app/api/events/create-event/route.ts
// ✅ admin_status: "pending" add kiya — event create hone ke baad MyApp pe nahi dikhega
// ✅ isListed: false — explicitly hide karo jab tak admin approve na kare

import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { EventCreateSchema, buildStartsAt, buildEndsAt } from "../../../../../lib/eventSchema/eventDefault";
import { INITIAL_USER_STATS } from "../../../../../lib/userSchema/userStatsSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const parsed = EventCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const creatorClerkId = (data.creatorClerkId || data.clerkUserId || "").trim();
    if (!creatorClerkId) {
      return NextResponse.json({ error: "creatorClerkId is required" }, { status: 400 });
    }

    const startsAt = buildStartsAt(data);
    const endsAt   = buildEndsAt(data);
    const effectiveCapacity = data.attendance ?? data.capacity ?? null;

    const doc: Record<string, any> = {
      title:          data.title.trim(),
      description:    (data.description ?? "").trim(),
      emoji:          data.emoji ?? "📍",
      creatorClerkId,
      creatorName:    body.creatorName || "Local Host",
      kind:           data.kind ?? "free",
      priceCents:     data.priceCents ?? null,
      joinPolicy:     data.joinPolicy ?? "open",
      attendance:     effectiveCapacity,
      capacity:       effectiveCapacity,
      attendees:      [],
      pendingRequests:[],
      date:           data.date ?? "",
      time:           data.time ?? "",
      endDate:        data.endDate ?? "",
      endTime:        data.endTime ?? "",
      timezone:       data.timezone ?? "",
      tags:           data.tags ?? [],
      visibility:     data.visibility ?? "public",
      status:         "active",

      // ✅ MODERATION FIELDS
      // Naya event hamesha pending rahega — admin approve kare tab hi MyApp pe dikhega
      // Admin dashboard mein ye event PENDING status mein aayega
      admin_status:      "pending",
      moderationStatus:  "pending",
      isListed:          false,   // get-events API is check nahi karta but future-proof hai
      isApproved:        false,

      location: {
        ...data.location,
        geo: {
          type: "Point",
          coordinates: [data.location.lng, data.location.lat],
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (typeof body.bannerUri === "string" && body.bannerUri.trim()) {
      doc.bannerUri = body.bannerUri.trim();
    }

    if (startsAt) doc.startsAt = startsAt;
    if (endsAt)   doc.endsAt   = endsAt;

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const targetCollection = doc.kind === "service" ? "services" : "events";
    const result = await db.collection(targetCollection).insertOne(doc);
    const eventId = result.insertedId.toString();

    const { eventsHosted, ...initialStats } = INITIAL_USER_STATS;
    await db.collection("user_stats").updateOne(
      { clerkUserId: creatorClerkId },
      {
        $inc: { eventsHosted: 1 },
        $set: { updatedAt: new Date() },
        $setOnInsert: {
          ...initialStats,
          clerkUserId: creatorClerkId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json(
      {
        ok: true,
        eventId,
        event: { ...doc, _id: eventId },
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("[POST /api/events/create-event]", e);
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}
