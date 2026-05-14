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
    const db = client.db("assis_auth");
    
    // ✅ Decide which collections to query based on 'kind'
    // If kind is 'service', we only look in services.
    // If kind is 'free'|'paid', we only look in events.
    // If kind is missing/empty, we look in both for the map.
    const collectionsToQuery = [];
    if (!kind || kind === "service") collectionsToQuery.push(db.collection("services"));
    if (!kind || kind === "free" || kind === "paid") collectionsToQuery.push(db.collection("events"));

    const query: any = {};

    if (visibility !== "all") query.visibility = visibility;

    if (country) query["location.countryCode"] = country;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    // ✅ kind filter
    if (kind === "free" || kind === "paid" || kind === "service") query.kind = kind;

    // ✅ Always exclude ended/deleted events
    // ✅ Smart expiry: hide events that have passed (combined with $and to avoid conflict)
    const now = new Date();
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const timeFilter = upcomingOnly
      ? { startsAt: { $gte: now } }
      : {
          $or: [
            { endsAt: { $gte: now } },                                       // Has explicit end time, not yet ended
            { endsAt: null, startsAt: { $gte: threeHoursAgo } },            // No endsAt but started within 3h
            { endsAt: null, startsAt: { $exists: false } },                  // No time set at all — keep
            { endsAt: { $exists: false }, startsAt: { $gte: threeHoursAgo } }, // endsAt missing, started within 3h
            { endsAt: { $exists: false }, startsAt: { $exists: false } },    // No dates at all — keep
          ],
        };

    // Merge status + time filters using $and so they don't override each other
    query.$and = [
      { status: { $nin: ["ended", "completed", "deleted"] } },
      timeFilter,
    ];

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

    // ✅ Fetch from all relevant collections in parallel
    const results = await Promise.all(
      collectionsToQuery.map(col => 
        col.find(query)
           .sort({ createdAt: -1, _id: -1 })
           .limit(limit)
           .toArray()
      )
    );

    // ✅ Merge and re-sort
    const docs = results.flat()
      .sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limit);

    // ✅ Post-fetch: filter events using date+time string fields (fallback for old docs)
    const nowTs = Date.now();
    const filteredDocs = docs.filter((e: any) => {
      // Priority 1: Use endsAt/startsAt if they exist (already handled by DB, but good to double check)
      if (e.endsAt) return new Date(e.endsAt).getTime() >= nowTs;
      if (e.startsAt) return new Date(e.startsAt).getTime() >= nowTs - 3 * 60 * 60 * 1000;

      // Fallback: parse date+time string
      const date = String(e.date || "").trim();
      const time = String(e.time || "").trim();
      const endTime = String(e.endTime || "").trim();

      if (!date) return true; // no date = keep

      let endMs = 0;
      if (endTime) {
        endMs = new Date(`${date}T${endTime}:00Z`).getTime();
      } else if (time) {
        endMs = new Date(`${date}T${time}:00Z`).getTime() + 3 * 60 * 60 * 1000; // 3h default
      } else {
        endMs = new Date(`${date}T23:59:59Z`).getTime();
      }

      if (!Number.isFinite(endMs)) return true;
      return endMs >= nowTs;
    });

    // ✅ Return all fields needed by map pins + sheets
    const allCreatorIds = Array.from(new Set(filteredDocs.map((e: any) => e.creatorClerkId))).filter(Boolean);
    
    const usersData = await db.collection("users").find(
      { clerkUserId: { $in: allCreatorIds } },
      { projection: { clerkUserId: 1, "profile.firstName": 1, "profile.lastName": 1, "profile.avatar.url": 1, "clerk.firstName": 1, "clerk.lastName": 1, "verification.idVerified": 1 } }
    ).toArray();

    const userMap = new Map(usersData.map(u => {
      const f = u.profile?.firstName || u.clerk?.firstName || "";
      const l = u.profile?.lastName || u.clerk?.lastName || "";
      return [
        u.clerkUserId,
        { name: `${f} ${l}`.trim() || "User", avatar: u.profile?.avatar?.url || "", isVerified: !!u.verification?.idVerified }
      ];
    }));

    const events = filteredDocs.map((e: any) => {
      const creator = userMap.get(String(e.creatorClerkId || ""));
      return {
        ...e,
        _id: e._id.toString(),
        creatorName: (e.creatorName && e.creatorName !== "Local Host") 
          ? e.creatorName 
          : (creator?.name || "Local Host"),
        creatorAvatar: creator?.avatar || e.creatorAvatar || "",
        creatorVerified: creator?.isVerified ?? false,
        // Ensure lat/lng are at top level for MapView
        lat: e.location?.lat ?? null,
        lng: e.location?.lng ?? null,
      };
    });

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