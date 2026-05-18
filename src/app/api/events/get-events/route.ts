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

function getTMEmoji(segment: string, genre: string, subGenre: string, title: string): string {
  const t = title.toLowerCase();

  // Music segment
  if (segment === "music") {
    if (genre.includes("rock") || subGenre.includes("rock")) return "🎸";
    if (genre.includes("hip-hop") || genre.includes("rap") || subGenre.includes("hip-hop")) return "🎤";
    if (genre.includes("pop")) return "🎵";
    if (genre.includes("jazz")) return "🎷";
    if (genre.includes("classical") || genre.includes("opera")) return "🎻";
    if (genre.includes("country")) return "🤠";
    if (genre.includes("r&b") || genre.includes("soul")) return "🎶";
    if (genre.includes("electronic") || genre.includes("dance") || genre.includes("edm")) return "🎧";
    if (genre.includes("metal") || genre.includes("punk")) return "🤘";
    if (genre.includes("reggae")) return "🇯🇲";
    if (genre.includes("latin")) return "💃";
    if (genre.includes("folk") || genre.includes("acoustic")) return "🪕";
    if (genre.includes("blues")) return "🎺";
    if (genre.includes("gospel") || genre.includes("christian")) return "🙏";
    return "🎵";
  }

  // Sports segment
  if (segment === "sports") {
    if (genre.includes("football") || subGenre.includes("nfl")) return "🏈";
    if (genre.includes("soccer") || genre.includes("football") && t.includes("soccer")) return "⚽";
    if (genre.includes("basketball") || subGenre.includes("nba")) return "🏀";
    if (genre.includes("baseball") || subGenre.includes("mlb")) return "⚾";
    if (genre.includes("hockey") || subGenre.includes("nhl")) return "🏒";
    if (genre.includes("tennis")) return "🎾";
    if (genre.includes("golf")) return "⛳";
    if (genre.includes("boxing") || genre.includes("mma") || genre.includes("wrestling")) return "🥊";
    if (genre.includes("motorsport") || genre.includes("racing") || t.includes("nascar") || t.includes("formula")) return "🏎️";
    if (genre.includes("cricket")) return "🏏";
    if (genre.includes("rugby")) return "🏉";
    if (genre.includes("volleyball")) return "🏐";
    if (genre.includes("swimming") || genre.includes("diving")) return "🏊";
    if (genre.includes("athletics") || genre.includes("track")) return "🏃";
    if (genre.includes("cycling")) return "🚴";
    if (genre.includes("gymnastics")) return "🤸";
    return "🏆";
  }

  // Arts & Theatre
  if (segment.includes("arts") || segment.includes("theatre")) {
    if (genre.includes("musical") || subGenre.includes("musical")) return "🎭";
    if (genre.includes("comedy") || t.includes("comedy") || t.includes("stand-up")) return "😂";
    if (genre.includes("ballet") || genre.includes("dance")) return "🩰";
    if (genre.includes("opera")) return "🎼";
    if (genre.includes("circus")) return "🎪";
    if (genre.includes("magic")) return "🪄";
    if (genre.includes("puppetry")) return "🎎";
    return "🎭";
  }

  // Family
  if (segment === "family") {
    if (t.includes("disney") || t.includes("frozen") || t.includes("lion king")) return "🏰";
    if (t.includes("circus")) return "🎪";
    if (t.includes("magic")) return "🪄";
    if (t.includes("holiday") || t.includes("christmas") || t.includes("xmas")) return "🎄";
    return "👨‍👩‍👧‍👦";
  }

  // Film/Media
  if (segment === "film" || segment === "media") {
    if (genre.includes("comedy")) return "😂";
    if (genre.includes("horror")) return "👻";
    if (genre.includes("action")) return "💥";
    return "🎬";
  }

  // Miscellaneous / fallback from title keywords
  if (t.includes("food") || t.includes("dinner") || t.includes("brunch") || t.includes("tasting")) return "🍽️";
  if (t.includes("wine") || t.includes("beer") || t.includes("cocktail") || t.includes("brewery")) return "🍷";
  if (t.includes("festival") || t.includes("fest")) return "🎡";
  if (t.includes("conference") || t.includes("summit") || t.includes("expo")) return "🎤";
  if (t.includes("marathon") || t.includes("run") || t.includes("race") || t.includes("5k")) return "🏃";
  if (t.includes("yoga") || t.includes("wellness") || t.includes("meditation")) return "🧘";
  if (t.includes("comedy") || t.includes("stand up") || t.includes("standup")) return "😂";
  if (t.includes("art") || t.includes("gallery") || t.includes("museum") || t.includes("exhibit")) return "🖼️";
  if (t.includes("dance") || t.includes("salsa") || t.includes("bachata")) return "💃";
  if (t.includes("halloween") || t.includes("horror")) return "👻";
  if (t.includes("christmas") || t.includes("holiday") || t.includes("xmas")) return "🎄";
  if (t.includes("new year")) return "🎆";
  if (t.includes("networking") || t.includes("meetup") || t.includes("social")) return "🤝";
  if (t.includes("tech") || t.includes("startup") || t.includes("hackathon")) return "💻";
  if (t.includes("kids") || t.includes("children") || t.includes("family")) return "👨‍👩‍👧‍👦";
  if (t.includes("charity") || t.includes("fundraiser") || t.includes("benefit")) return "❤️";
  if (t.includes("market") || t.includes("fair") || t.includes("bazaar")) return "🛍️";

  return "📍";
}

async function fetchTicketmasterEvents(params: any) {
  const tmApiKey = process.env.TICKETMASTER_API_KEY;
  if (!tmApiKey) return [];

  try {
    const { nearLatRaw, nearLngRaw, radiusMRaw, city } = params;
    const PAGE_SIZE = 200; // Ticketmaster max per request
    const NUM_PAGES = 5;   // Fetch 5 pages in parallel = up to 1000 events

    // Use current time to filter out past events
    const nowISO = new Date().toISOString().split('.')[0] + "Z";

    // Build base URL depending on location params
    let baseUrl = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${tmApiKey}&size=${PAGE_SIZE}&sort=date,asc&startDateTime=${nowISO}`;

    if (nearLatRaw && nearLngRaw) {
      const radiusMiles = radiusMRaw ? Math.max(1, Math.round(Number(radiusMRaw) / 1609.34)) : 50;
      baseUrl += `&latlong=${nearLatRaw},${nearLngRaw}&radius=${radiusMiles}&unit=miles`;
    } else if (city) {
      baseUrl += `&city=${encodeURIComponent(city)}`;
    }

    // Fetch page 0 first to know total pages available
    const firstRes = await fetch(`${baseUrl}&page=0`);
    if (!firstRes.ok) throw new Error(`TM HTTP ${firstRes.status}`);
    const firstData = await firstRes.json();

    let events: any[] = firstData?._embedded?.events || [];
    const totalPages: number = firstData?.page?.totalPages ?? 0;

    // If no events locally, fallback to global (no location filter)
    if (events.length === 0 && (nearLatRaw || city)) {
      const fallbackBase = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${tmApiKey}&size=${PAGE_SIZE}&sort=date,asc&startDateTime=${nowISO}`;
      const fallbackRes = await fetch(`${fallbackBase}&page=0`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        events = fallbackData?._embedded?.events || [];
        const fbTotalPages = fallbackData?.page?.totalPages ?? 0;
        // Parallel fetch remaining fallback pages
        if (fbTotalPages > 1) {
          const extraPages = Math.min(NUM_PAGES - 1, fbTotalPages - 1);
          const pagePromises = Array.from({ length: extraPages }, (_, i) =>
            fetch(`${fallbackBase}&page=${i + 1}`).then(r => r.ok ? r.json() : null)
          );
          const extraResults = await Promise.all(pagePromises);
          for (const r of extraResults) {
            if (r?._embedded?.events) events = events.concat(r._embedded.events);
          }
        }
      }
    } else if (totalPages > 1) {
      // Parallel fetch remaining pages for the location-based result
      const extraPages = Math.min(NUM_PAGES - 1, totalPages - 1);
      const pagePromises = Array.from({ length: extraPages }, (_, i) =>
        fetch(`${baseUrl}&page=${i + 1}`).then(r => r.ok ? r.json() : null)
      );
      const extraResults = await Promise.all(pagePromises);
      for (const r of extraResults) {
        if (r?._embedded?.events) events = events.concat(r._embedded.events);
      }
    }

    // Transform to internal schema
    return events.map((e: any) => {
      const img = e.images?.find((i: any) => i.ratio === "16_9" && i.width > 600) || e.images?.[0];
      const venue = e._embedded?.venues?.[0];
      
      let price = 0;
      if (e.priceRanges && e.priceRanges.length > 0) {
        price = Math.round(e.priceRanges[0].min * 100);
      }

      // Smart emoji from Ticketmaster classifications
      const cls = e.classifications?.[0];
      const segment = (cls?.segment?.name || "").toLowerCase();
      const genre = (cls?.genre?.name || "").toLowerCase();
      const subGenre = (cls?.subGenre?.name || "").toLowerCase();
      const emoji = getTMEmoji(segment, genre, subGenre, e.name || "");

      return {
        _id: `tm_${e.id}`,
        title: e.name,
        emoji,
        description: e.description || e.info || "",
        bannerUri: img?.url || "",
        date: e.dates?.start?.localDate || "",
        time: e.dates?.start?.localTime || "",
        startsAt: e.dates?.start?.dateTime ? new Date(e.dates.start.dateTime) : undefined,
        priceCents: price,
        kind: price > 0 ? "paid" : "event",
        creatorName: "Ticketmaster",
        creatorClerkId: "ticketmaster",
        location: {
          lat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
          lng: venue?.location?.longitude ? Number(venue.location.longitude) : null,
          city: venue?.city?.name || "",
          admin1: venue?.state?.name || "",
          address: venue?.address?.line1 || "",
          formattedAddress: `${venue?.address?.line1 || ""}, ${venue?.city?.name || ""}`.replace(/^,\s*/, ''),
        },
        status: "active",
        createdAt: new Date(),
      };
    });

  } catch (err) {
    console.error("Ticketmaster fetch error:", err);
    return [];
  }
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
    const queries: Promise<any[]>[] = collectionsToQuery.map(col => 
      col.find(query)
         .sort({ createdAt: -1, _id: -1 })
         .limit(limit)
         .toArray()
    );

    // ✅ Fetch Ticketmaster events ONLY if on the first page and not filtering solely for services
    if (!cursorId && (!kind || kind === "free" || kind === "paid")) {
      queries.push(fetchTicketmasterEvents({ nearLatRaw, nearLngRaw, radiusMRaw, city }));
    }

    const results = await Promise.all(queries);

    // ✅ Separate DB results from Ticketmaster results
    // Ticketmaster is always the last item pushed into queries[]
    const hasTM = !cursorId && (!kind || kind === "free" || kind === "paid");
    const dbResults = hasTM ? results.slice(0, -1) : results;
    const tmResults = hasTM ? (results[results.length - 1] || []) : [];

    // DB events sorted by createdAt desc
    const dbDocs = dbResults.flat().sort((a: any, b: any) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // DB events come FIRST, then Ticketmaster events appended after
    const docs = [...dbDocs, ...tmResults];

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
      { projection: { clerkUserId: 1, "profile.firstName": 1, "profile.lastName": 1, "profile.avatar.url": 1, "clerk.firstName": 1, "clerk.lastName": 1 } }
    ).toArray();

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
      return {
        ...e,
        _id: e._id.toString(),
        creatorName: (e.creatorName && e.creatorName !== "Local Host") 
          ? e.creatorName 
          : (creator?.name || "Local Host"),
        creatorAvatar: creator?.avatar || e.creatorAvatar || "",
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