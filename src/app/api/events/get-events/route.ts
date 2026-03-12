// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected
//     ? null
//     : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// function normKey(s: string) {
//   return s
//     .trim()
//     .toLowerCase()
//     .replace(/\s+/g, " ")
//     .replace(/[^\p{L}\p{N}\s-]/gu, "")
//     .replace(/\s/g, "-");
// }

// export async function GET(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const { searchParams } = new URL(req.url);

//     const limit = Math.min(Number(searchParams.get("limit") || 50), 500);

//     // Filters (optional)
//     const country = (searchParams.get("country") || "").trim().toUpperCase(); // e.g., "US"
//     const admin1 = (searchParams.get("admin1") || "").trim();                // e.g., "New York" (or your stored value)
//     const city = (searchParams.get("city") || "").trim();
//     const cityKey = (searchParams.get("cityKey") || (city ? normKey(city) : "")).trim();

//     // Nearby (optional)
//     const nearLatRaw = searchParams.get("nearLat");
//     const nearLngRaw = searchParams.get("nearLng");
//     const radiusMRaw = searchParams.get("radiusM");

//     // Cursor pagination (optional): pass last item's createdAt + _id
//     const cursorCreatedAt = searchParams.get("cursorCreatedAt"); // ISO string
//     const cursorId = searchParams.get("cursorId");               // stringified ObjectId

//     // Simple flags
//     const visibility = (searchParams.get("visibility") || "public").trim(); // "public" | "private" | "all"
//     const upcomingOnly = (searchParams.get("upcomingOnly") || "").trim() === "1";

//     const client = await clientPromise;
//     const db = client.db("assis_auth");
//     const col = db.collection("events");

//     const query: any = {};

//     // Visibility default: public
//     if (visibility !== "all") query.visibility = visibility;

//     // Country/city filtering
//     if (country) query["location.countryCode"] = country;
//     if (admin1) query["location.admin1"] = admin1;
//     if (cityKey) query["location.cityKey"] = cityKey;

//     // Upcoming filter (uses startsAt if you store it)
//     if (upcomingOnly) query.startsAt = { $gte: new Date() };

//     // Nearby filter (requires 2dsphere index on location.geo)
//     if (nearLatRaw && nearLngRaw) {
//       const lat = Number(nearLatRaw);
//       const lng = Number(nearLngRaw);
//       if (Number.isFinite(lat) && Number.isFinite(lng)) {
//         const radiusM = radiusMRaw ? Number(radiusMRaw) : undefined;
//         query["location.geo"] = {
//           $near: {
//             $geometry: { type: "Point", coordinates: [lng, lat] },
//             ...(radiusM && Number.isFinite(radiusM) ? { $maxDistance: radiusM } : {}),
//           },
//         };
//       }
//     }

//     // Cursor pagination (stable: createdAt desc, then _id desc)
//     // If provided, we fetch "older" than cursor.
//     if (cursorCreatedAt && cursorId) {
//       let cursorDate: Date | null = null;
//       try {
//         cursorDate = new Date(cursorCreatedAt);
//         if (!Number.isFinite(cursorDate.getTime())) cursorDate = null;
//       } catch {
//         cursorDate = null;
//       }

//       if (cursorDate) {
//         // Important: ObjectId isn't available without importing mongodb's ObjectId.
//         // We'll keep this endpoint dependency-free: if cursorId exists, we still do time-based cursor.
//         // If you want exact tie-break ordering, import ObjectId and include _id comparison.
//         query.createdAt = { $lt: cursorDate };
//       }
//     }

//     const docs = await col
//       .find(query)
//       .sort({ createdAt: -1, _id: -1 })
//       .limit(limit)
//       .toArray();

//     const events = docs.map((e: any) => ({ ...e, _id: e._id.toString() }));

//     console.log("sample event keys:", Object.keys(docs?.[0] || {}));
//     console.log("sample description:", docs?.[0]?.description);


//     // Return next cursor
//     const last = docs[docs.length - 1];
//     const nextCursor =
//       last
//         ? {
//           cursorCreatedAt: (last.createdAt ? new Date(last.createdAt) : new Date()).toISOString(),
//           cursorId: last._id.toString(),
//         }
//         : null;

//     return NextResponse.json({ ok: true, events, nextCursor });
//   } catch (e: any) {
//     return NextResponse.json(
//       { error: "Server error", detail: e?.message ?? "" },
//       { status: 500 }
//     );
//   }
// }








// app/api/events/get-events/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);

    const limit = Math.min(Number(searchParams.get("limit") || 50), 500);

    const country = (searchParams.get("country") || "").trim().toUpperCase();
    const admin1 = (searchParams.get("admin1") || "").trim();
    const city = (searchParams.get("city") || "").trim();
    const cityKey = (searchParams.get("cityKey") || (city ? normKey(city) : "")).trim();

    const nearLatRaw = searchParams.get("nearLat");
    const nearLngRaw = searchParams.get("nearLng");
    const radiusMRaw = searchParams.get("radiusM");

    const cursorCreatedAt = searchParams.get("cursorCreatedAt");
    const cursorId = searchParams.get("cursorId");

    const visibility = (searchParams.get("visibility") || "public").trim();
    const upcomingOnly = (searchParams.get("upcomingOnly") || "").trim() === "1";

    // ✅ kind filter support: "free" | "paid" | "service"
    const kind = (searchParams.get("kind") || "").trim();

    const client = await clientPromise;
    // ✅ FIXED: was "myApp" — now consistent with rest of app
    const db = client.db("assis_auth");
    const col = db.collection("events");

    const query: any = {};

    if (visibility !== "all") query.visibility = visibility;

    if (country) query["location.countryCode"] = country;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    // ✅ kind filter
    if (kind === "free" || kind === "paid" || kind === "service") query.kind = kind;

    // ✅ Always exclude ended/deleted events
    query.status = { $nin: ["ended", "completed", "deleted"] };

    // ✅ Smart expiry: hide events that have passed (with 24h grace for ongoing)
    if (upcomingOnly) {
      query.startsAt = { $gte: new Date() };
    } else {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      query.$or = [
        { startsAt: { $exists: false } },
        { startsAt: null },
        { startsAt: { $gte: cutoff } },
      ];
    }

    if (nearLatRaw && nearLngRaw) {
      const lat = Number(nearLatRaw);
      const lng = Number(nearLngRaw);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const radiusM = radiusMRaw ? Number(radiusMRaw) : undefined;
        query["location.geo"] = {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            ...(radiusM && Number.isFinite(radiusM) ? { $maxDistance: radiusM } : {}),
          },
        };
      }
    }

    if (cursorCreatedAt && cursorId) {
      let cursorDate: Date | null = null;
      try {
        cursorDate = new Date(cursorCreatedAt);
        if (!Number.isFinite(cursorDate.getTime())) cursorDate = null;
      } catch {
        cursorDate = null;
      }
      if (cursorDate) {
        query.createdAt = { $lt: cursorDate };
      }
    }

    const docs = await col
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    // ✅ Post-fetch: filter events using date+time string fields (fallback for old docs)
    const now = Date.now();
    const filteredDocs = docs.filter((e: any) => {
      // If startsAt exists, DB already handled it above
      if (e.startsAt) return true;
      // Fallback: parse date+time string
      const date = String(e.date || "").trim();
      const time = String(e.time || "").trim();
      if (!date) return true; // no date = keep (creator may not have set it)
      const ms = date && time
        ? new Date(`${date}T${time}:00Z`).getTime()
        : new Date(`${date}T12:00:00Z`).getTime();
      if (!Number.isFinite(ms)) return true;
      // 24h grace period
      return ms >= now - 24 * 60 * 60 * 1000;
    });

    // ✅ Return all fields needed by map pins + sheets
    const events = filteredDocs.map((e: any) => ({
      ...e,
      _id: e._id.toString(),
      // Ensure lat/lng are at top level for MapView
      lat: e.location?.lat ?? null,
      lng: e.location?.lng ?? null,
    }));

    const last = filteredDocs[filteredDocs.length - 1];
    const nextCursor = last
      ? {
          cursorCreatedAt: (last.createdAt ? new Date(last.createdAt) : new Date()).toISOString(),
          cursorId: last._id.toString(),
        }
      : null;

    return NextResponse.json({ ok: true, events, nextCursor });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}