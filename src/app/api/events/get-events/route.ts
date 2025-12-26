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

    // Filters (optional)
    const country = (searchParams.get("country") || "").trim().toUpperCase(); // e.g., "US"
    const admin1 = (searchParams.get("admin1") || "").trim();                // e.g., "New York" (or your stored value)
    const city = (searchParams.get("city") || "").trim();
    const cityKey = (searchParams.get("cityKey") || (city ? normKey(city) : "")).trim();

    // Nearby (optional)
    const nearLatRaw = searchParams.get("nearLat");
    const nearLngRaw = searchParams.get("nearLng");
    const radiusMRaw = searchParams.get("radiusM");

    // Cursor pagination (optional): pass last item's createdAt + _id
    const cursorCreatedAt = searchParams.get("cursorCreatedAt"); // ISO string
    const cursorId = searchParams.get("cursorId");               // stringified ObjectId

    // Simple flags
    const visibility = (searchParams.get("visibility") || "public").trim(); // "public" | "private" | "all"
    const upcomingOnly = (searchParams.get("upcomingOnly") || "").trim() === "1";

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");
    const col = db.collection("events");

    const query: any = {};

    // Visibility default: public
    if (visibility !== "all") query.visibility = visibility;

    // Country/city filtering
    if (country) query["location.countryCode"] = country;
    if (admin1) query["location.admin1"] = admin1;
    if (cityKey) query["location.cityKey"] = cityKey;

    // Upcoming filter (uses startsAt if you store it)
    if (upcomingOnly) query.startsAt = { $gte: new Date() };

    // Nearby filter (requires 2dsphere index on location.geo)
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

    // Cursor pagination (stable: createdAt desc, then _id desc)
    // If provided, we fetch "older" than cursor.
    if (cursorCreatedAt && cursorId) {
      let cursorDate: Date | null = null;
      try {
        cursorDate = new Date(cursorCreatedAt);
        if (!Number.isFinite(cursorDate.getTime())) cursorDate = null;
      } catch {
        cursorDate = null;
      }

      if (cursorDate) {
        // Important: ObjectId isn't available without importing mongodb's ObjectId.
        // We'll keep this endpoint dependency-free: if cursorId exists, we still do time-based cursor.
        // If you want exact tie-break ordering, import ObjectId and include _id comparison.
        query.createdAt = { $lt: cursorDate };
      }
    }

    const docs = await col
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const events = docs.map((e: any) => ({ ...e, _id: e._id.toString() }));

    console.log("sample event keys:", Object.keys(docs?.[0] || {}));
    console.log("sample description:", docs?.[0]?.description);


    // Return next cursor
    const last = docs[docs.length - 1];
    const nextCursor =
      last
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
