// app/api/events/get-events/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { userCache, type CachedUser } from "../../../../../lib/cache";
import crypto from "crypto";

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
  const start = Date.now();
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);

    // ✅ Lower default limit: 100 (was 500) — sufficient for map display
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

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

    // ✅ Delta sync: client passes `since` (Unix ms) to get only newer events
    const sinceRaw = searchParams.get("since");
    const sinceMs = sinceRaw ? Number(sinceRaw) : 0;

    // ✅ Decide which collections to query
    const kind = (searchParams.get("kind") || "").trim();

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const col = db.collection("events");

    const query: any = {};

    if (visibility !== "all") query.visibility = visibility;

    if (country) query["location.countryCode"] = country;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    // ✅ kind filter
    if (kind === "free" || kind === "paid") query.kind = kind;

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
            { kind: "recurring" },                                           // Perpetual recurring activities
          ],
        };

    const includePausedFor = (searchParams.get("includePausedFor") || "").trim();

    // Merge status + time filters using $and so they don't override each other
    query.$and = [
      {
        $or: [
          { status: { $nin: ["ended", "completed", "deleted", "paused"] } },
          ...(includePausedFor ? [{ status: "paused", creatorClerkId: includePausedFor }] : [])
        ]
      },
      timeFilter,
    ];

    // ✅ Delta sync: only return events updated after `since`
    if (sinceMs > 0) {
      const sinceDate = new Date(sinceMs);
      query.$and.push({
        $or: [
          { updatedAt: { $gte: sinceDate } },
          { createdAt: { $gte: sinceDate } },
        ],
      });
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

    // ✅ Indexed query — uses compound index (status+endsAt, createdAt, location.geo)
    const docs = await col
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

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

    // ✅ ETag: hash of event IDs — if same events, return 304 Not Modified
    const eventIdHash = crypto
      .createHash("md5")
      .update(filteredDocs.map((e: any) => e._id.toString()).join(","))
      .digest("hex");
    const etag = `"${eventIdHash}"`;

    const clientEtag = req.headers.get("if-none-match");
    if (clientEtag === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
          "x-response-time": `${Date.now() - start}ms`,
        },
      });
    }

    // ✅ Batch user lookup with in-memory cache (avoids DB hit for known users)
    const allCreatorIds = Array.from(
      new Set(filteredDocs.map((e: any) => e.creatorClerkId))
    ).filter(Boolean) as string[];

    // Split into cached vs uncached
    const userMap = new Map<string, CachedUser>();
    const uncachedIds: string[] = [];

    for (const id of allCreatorIds) {
      const cached = userCache.get(id);
      if (cached) {
        userMap.set(id, cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // Only query DB for uncached users
    if (uncachedIds.length > 0) {
      const usersData = await db.collection("users").find(
        { clerkUserId: { $in: uncachedIds } },
        {
          projection: {
            clerkUserId: 1,
            "profile.firstName": 1,
            "profile.lastName": 1,
            "profile.avatar.url": 1,
            "clerk.firstName": 1,
            "clerk.lastName": 1,
            "profile.verificationStatus": 1,
          },
        }
      ).toArray();

      for (const u of usersData) {
        const f = u.profile?.firstName || u.clerk?.firstName || "";
        const l = u.profile?.lastName || u.clerk?.lastName || "";
        const entry: CachedUser = {
          name: `${f} ${l}`.trim() || "User",
          avatar: u.profile?.avatar?.url || "",
          isVerified: u.profile?.verificationStatus === "verified",
        };
        userMap.set(u.clerkUserId, entry);
        userCache.set(u.clerkUserId, entry); // ✅ Cache for next 2 minutes
      }
    }

    const events = filteredDocs.map((e: any) => {
      const creator = userMap.get(String(e.creatorClerkId || ""));
      return {
        ...e,
        _id: e._id.toString(),
        creatorName:
          e.creatorName && e.creatorName !== "Local Host"
            ? e.creatorName
            : creator?.name || "Local Host",
        creatorAvatar: creator?.avatar || e.creatorAvatar || "",
        isVerified: !!creator?.isVerified,
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

    const responseTime = Date.now() - start;

    return NextResponse.json(
      { ok: true, events, nextCursor, serverTime: Date.now() },
      {
        headers: {
          // ✅ Cache-Control: edge caches can hold for 15s, serve stale for 30s while revalidating
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
          // ✅ ETag for conditional requests (304 support)
          ETag: etag,
          // ✅ Monitoring header
          "x-response-time": `${responseTime}ms`,
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}