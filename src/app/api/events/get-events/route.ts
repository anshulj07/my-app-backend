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

    const limit = Number(searchParams.get("limit") || 5000) || 5000;

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

    // Which internal collections to query based on 'kind' filter
    const collectionsToQuery = [];
    if (!kind || kind === "service") collectionsToQuery.push(db.collection("services"));
    if (!kind || kind === "free" || kind === "paid") collectionsToQuery.push(db.collection("events"));

    // category filter (walking/running/pickleball/hiking/fitness/networking/social/sports)
    const COMMUNITY_CATEGORIES = new Set([
      "walking", "running", "pickleball", "hiking",
      "fitness", "networking", "social", "sports", "other",
    ]);
    const category = (searchParams.get("category") || "").trim().toLowerCase();

    // external_events: include when no kind filter OR kind is 'free'
    // skip when filtering for paid/service (external events are all free)
    const includeExternal = !kind || kind === "free";
    if (includeExternal) collectionsToQuery.push(db.collection("external_events"));

    const query: any = {};

    // Exclude private events — but don't require "public" explicitly.
    // Many docs lack the visibility field entirely; $ne keeps them visible.
    if (visibility !== "all") {
      query.visibility = { $ne: "private" };
    }

    if (country) query["location.countryCode"] = country;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    // kind filter (only for internal events/services)
    if (kind === "free" || kind === "paid" || kind === "service") query.kind = kind;

    // category filter — applies to external_events; for internal events we match on tags
    if (category && COMMUNITY_CATEGORIES.has(category)) query.category = category;

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

    // Only fetch fields needed for map pins + event sheet (skip heavy arrays)
    const mapProjection = {
      _id: 1, title: 1, emoji: 1, kind: 1, status: 1, description: 1,
      location: 1, address: 1, when: 1,
      creatorClerkId: 1, creatorName: 1, creatorAvatar: 1,
      date: 1, time: 1, startsAt: 1, endsAt: 1, endTime: 1, endDate: 1,
      priceCents: 1, joinPolicy: 1, attendance: 1, createdAt: 1,
      visibility: 1, tags: 1, bannerImage: 1, bannerUri: 1,
      // external_events-specific fields
      category: 1, source: 1, sourceUrl: 1, organizer: 1,
      // explicitly exclude heavy arrays: attendees, pendingRequests
    };

    // ✅ Fetch from all relevant collections in parallel
    const results = await Promise.all(
      collectionsToQuery.map(col =>
        col.find(query, { projection: mapProjection })
           .sort({ createdAt: -1, _id: -1 })
           .limit(limit)
           .toArray()
      )
    );

    // ✅ Merge, deduplicate by _id (same doc may exist in both collections), re-sort
    const seen = new Set<string>();
    const docs = results.flat()
      .filter((e: any) => {
        const id = e._id?.toString();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limit);

    // Collect creator IDs from all docs before filtering (start users query early)
    const allCreatorIdsRaw = Array.from(new Set(docs.map((e: any) => e.creatorClerkId))).filter(Boolean) as string[];

    const nowTs = Date.now();
    const postFilter = (e: any): boolean => {
      if (e.endsAt) return new Date(e.endsAt).getTime() >= nowTs;
      if (e.startsAt) return new Date(e.startsAt).getTime() >= nowTs - 3 * 60 * 60 * 1000;
      const date = String(e.date || "").trim();
      const time = String(e.time || "").trim();
      const endTime = String(e.endTime || "").trim();
      if (!date) return true;
      let endMs = 0;
      if (endTime)      endMs = new Date(`${date}T${endTime}:00Z`).getTime();
      else if (time)    endMs = new Date(`${date}T${time}:00Z`).getTime() + 3 * 60 * 60 * 1000;
      else              endMs = new Date(`${date}T23:59:59Z`).getTime();
      return !Number.isFinite(endMs) || endMs >= nowTs;
    };

    // ✅ Run post-filter and users lookup concurrently
    const [filteredDocs, usersData] = await Promise.all([
      Promise.resolve(docs.filter(postFilter)),
      db.collection("users").find(
        { clerkUserId: { $in: allCreatorIdsRaw } },
        { projection: { clerkUserId: 1, "profile.firstName": 1, "profile.lastName": 1, "profile.avatar.url": 1, "clerk.firstName": 1, "clerk.lastName": 1 } }
      ).toArray(),
    ]);

    const userMap = new Map(usersData.map(u => {
      const f = u.profile?.firstName || u.clerk?.firstName || "";
      const l = u.profile?.lastName || u.clerk?.lastName || "";
      return [
        u.clerkUserId,
        { name: `${f} ${l}`.trim() || "User", avatar: u.profile?.avatar?.url || "" }
      ];
    }));

    const events = filteredDocs.map((e: any) => {
      const creator = userMap.get(String(e.creatorClerkId || ""));
      const isExternal = !!e.source; // external_events have a 'source' field
      return {
        ...e,
        _id: e._id.toString(),
        creatorName: isExternal
          ? (e.organizer?.name || e.creatorName || "Community Event")
          : ((e.creatorName && e.creatorName !== "Local Host")
              ? e.creatorName
              : (creator?.name || "Local Host")),
        creatorAvatar: creator?.avatar || e.creatorAvatar || "",
        // Ensure lat/lng are at top level for MapView
        lat: e.location?.lat ?? null,
        lng: e.location?.lng ?? null,
        // Community discovery fields
        category:   e.category   ?? null,
        source:     e.source     ?? "manual",
        sourceUrl:  e.sourceUrl  ?? null,
      };
    });

    const last = filteredDocs[filteredDocs.length - 1];
    const nextCursor = last
      ? {
          cursorCreatedAt: (last.createdAt ? new Date(last.createdAt) : new Date()).toISOString(),
          cursorId: last._id.toString(),
        }
      : null;

    return NextResponse.json({ ok: true, events, nextCursor }, {
      headers: {
        // Cache 15s at CDN/proxy; client revalidates. Prevents hammering DB on rapid re-opens.
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch (e: any) {
    console.error("[get-events] Error:", e);
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}