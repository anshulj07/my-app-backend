/**
 * ingest-usa-events.mjs
 *
 * Fetches community events from RunSignup (no auth) → upserts into external_events.
 * Geocodes event cities via Nominatim (OpenStreetMap, free, no key needed).
 * Targets: running races, fun runs, 5K/10K, walking events, triathlons.
 * Countries: USA + Canada. Hard cap: 100 events per run.
 *
 * Optional second source:
 *   ACTIVE_API_KEY (register at developer.active.com) adds outdoor sports events.
 *
 * Setup:
 *   Add to .env:  MONGODB_URI=...
 *   (optional)    ACTIVE_API_KEY=...
 *
 * Run:
 *   node --env-file=.env scripts/ingest-usa-events.mjs
 *
 * Rate limits:
 *   RunSignup: no documented limit (be polite — 500ms between requests)
 *   Nominatim: 1 req/sec (we cache city lookups so rarely hits limit)
 */

import { MongoClient } from "mongodb";

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGODB_URI    = process.env.MONGODB_URI;
const ACTIVE_API_KEY = process.env.ACTIVE_API_KEY; // optional

if (!MONGODB_URI) { console.error("❌  Missing MONGODB_URI"); process.exit(1); }

const MAX_EVENTS = 100;

// ─── Cities: USA + Canada ─────────────────────────────────────────────────────

const CITIES = [
  // USA
  { label: "New York, NY",      lat: 40.7128,  lng: -74.0060  },
  { label: "Los Angeles, CA",   lat: 34.0522,  lng: -118.2437 },
  { label: "Chicago, IL",       lat: 41.8781,  lng: -87.6298  },
  { label: "Houston, TX",       lat: 29.7604,  lng: -95.3698  },
  { label: "Phoenix, AZ",       lat: 33.4484,  lng: -112.0740 },
  { label: "San Francisco, CA", lat: 37.7749,  lng: -122.4194 },
  { label: "Seattle, WA",       lat: 47.6062,  lng: -122.3321 },
  { label: "Denver, CO",        lat: 39.7392,  lng: -104.9903 },
  { label: "Austin, TX",        lat: 30.2672,  lng: -97.7431  },
  { label: "Miami, FL",         lat: 25.7617,  lng: -80.1918  },
  { label: "Atlanta, GA",       lat: 33.7490,  lng: -84.3880  },
  { label: "Boston, MA",        lat: 42.3601,  lng: -71.0589  },
  { label: "Portland, OR",      lat: 45.5051,  lng: -122.6750 },
  { label: "Minneapolis, MN",   lat: 44.9778,  lng: -93.2650  },
  { label: "Washington, DC",    lat: 38.9072,  lng: -77.0369  },
  { label: "Nashville, TN",     lat: 36.1627,  lng: -86.7816  },
  { label: "San Diego, CA",     lat: 32.7157,  lng: -117.1611 },
  { label: "Dallas, TX",        lat: 32.7767,  lng: -96.7970  },
  { label: "Philadelphia, PA",  lat: 39.9526,  lng: -75.1652  },
  { label: "Charlotte, NC",     lat: 35.2271,  lng: -80.8431  },
  // Canada
  { label: "Toronto, ON",       lat: 43.6532,  lng: -79.3832  },
  { label: "Vancouver, BC",     lat: 49.2827,  lng: -123.1207 },
  { label: "Montreal, QC",      lat: 45.5017,  lng: -73.5673  },
  { label: "Calgary, AB",       lat: 51.0447,  lng: -114.0719 },
  { label: "Ottawa, ON",        lat: 45.4215,  lng: -75.6972  },
];

// ─── Category detection ───────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { category: "pickleball", keywords: ["pickleball", "pickle ball"] },
  { category: "running",    keywords: ["5k", "10k", "half marathon", "marathon", "fun run", "running", "run club", "trail run", "cross country", "sprint", "jog"] },
  { category: "hiking",     keywords: ["hiking", "hike", "trail hike", "summit", "backpacking", "trekking", "trail walk"] },
  { category: "walking",    keywords: ["walking", "walk club", "morning walk", "group walk", "stroll", "1 mile", "fun walk"] },
  { category: "fitness",    keywords: ["triathlon", "duathlon", "obstacle", "spartan", "yoga", "pilates", "crossfit", "fitness", "workout", "bootcamp", "hiit", "spin", "cycling race", "bike race"] },
  { category: "sports",     keywords: ["basketball", "soccer", "tennis", "golf", "softball", "frisbee", "cricket", "rugby", "badminton", "swimming", "swim meet", "cycling", "biking"] },
  { category: "social",     keywords: ["social", "community", "meetup", "park", "gathering", "hangout", "family fun", "community event"] },
];

const CATEGORY_EMOJI = {
  walking: "🚶", running: "🏃", pickleball: "🏓", hiking: "🥾",
  fitness: "💪", social: "🎉", sports: "⚽", other: "📍",
};

function detectCategory(title, description) {
  const text = [title, description ?? ""].join(" ").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) return rule.category;
  }
  return "running"; // RunSignup is almost always running
}

// ─── HTML strip ───────────────────────────────────────────────────────────────

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x[0-9a-f]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Price detection ──────────────────────────────────────────────────────────

function extractPrice(events) {
  if (!events?.length) return { kind: "free", priceCents: 0 };
  const fee = events[0]?.registration_periods?.[0]?.race_fee ?? "";
  if (!fee || fee === "$0.00" || fee.toLowerCase() === "free") {
    return { kind: "free", priceCents: 0 };
  }
  const cents = Math.round(parseFloat(fee.replace(/[^0-9.]/g, "")) * 100);
  return { kind: "paid", priceCents: Number.isFinite(cents) ? cents : null };
}

// ─── Geocoding (Nominatim) ────────────────────────────────────────────────────
// Cache city+state → {lat, lng} to stay well under 1 req/sec limit

const geocodeCache = new Map();

async function geocode(city, state, countryCode) {
  const key = `${city}|${state}|${countryCode}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const params = new URLSearchParams({
    city,
    state,
    country: countryCode === "CA" ? "Canada" : "United States",
    format: "json",
    limit: "1",
  });

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { "User-Agent": "community-event-ingest/1.0" } }
    );
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const data = await res.json();
    const result = data?.[0]
      ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      : null;
    geocodeCache.set(key, result);
    await sleep(1100); // Nominatim: 1 req/sec
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

// ─── RunSignup fetch ──────────────────────────────────────────────────────────

async function fetchRunSignup(lat, lng, perPage = 10) {
  const params = new URLSearchParams({
    format:           "json",
    lat:              String(lat),
    long:             String(lng),
    radius:           "50",
    results_per_page: String(perPage),
    page:             "1",
    start_date_min:   new Date().toISOString().split("T")[0],
    events:           "T",
    include_race_ids: "F",
  });

  const res = await fetch(`https://runsignup.com/Rest/races?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.races ?? [];
}

async function normaliseRunSignup(raceEntry, fallbackLat, fallbackLng) {
  const race = raceEntry?.race;
  if (!race?.race_id) return null;

  // Skip canceled events
  const nameLC = String(race.name ?? "").toLowerCase();
  if (nameLC.includes("cancel") || nameLC.includes("postpone")) return null;

  const title       = String(race.name ?? "").trim();
  const description = stripHtml(race.description ?? "").slice(0, 600);
  if (!title) return null;

  // Parse date: "MM/DD/YYYY"
  const parseDateMMDDYYYY = str => {
    if (!str) return null;
    const [m, d, y] = str.split("/");
    if (!m || !d || !y) return null;
    return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T09:00:00Z`);
  };

  const startsAt = parseDateMMDDYYYY(race.next_date);
  const endsAt   = parseDateMMDDYYYY(race.next_end_date);
  if (!startsAt) return null;
  if (startsAt.getTime() < Date.now()) return null;

  const expiresAt = endsAt
    ? new Date(endsAt.getTime()   + 2 * 60 * 60 * 1000)
    : new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);

  // Geocode city (use fallback if fails)
  const addr = race.address ?? {};
  let lat = fallbackLat;
  let lng = fallbackLng;
  if (addr.city && addr.state) {
    const geo = await geocode(addr.city, addr.state, addr.country_code ?? "US");
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }

  const category = detectCategory(title, description);
  const { kind, priceCents } = extractPrice(race.events);

  return {
    source:    "runsignup",
    sourceId:  String(race.race_id),
    sourceUrl: race.url ?? "",

    title,
    description,
    emoji:    CATEGORY_EMOJI[category] ?? "📍",
    category,
    tags:     [],

    kind,
    priceCents,

    startsAt,
    endsAt,

    location: {
      lat, lng,
      address:          addr.street ?? "",
      formattedAddress: [addr.street, addr.city, addr.state, addr.country_code]
        .filter(Boolean).join(", "),
      city:        addr.city         ?? "",
      state:       addr.state        ?? "",
      country:     addr.country_code ?? "",
      countryCode: addr.country_code ?? "",
      geo: { type: "Point", coordinates: [lng, lat] },
    },

    organizer: { name: "", url: race.url ?? "" },

    attendance:  0,
    bannerImage: race.logo_url ?? "",

    status:     "active",
    visibility: "public",

    fetchedAt: new Date(),
    expiresAt,
  };
}

// ─── ACTIVE Network (optional) ────────────────────────────────────────────────

async function fetchActive(lat, lng) {
  if (!ACTIVE_API_KEY) return [];

  const params = new URLSearchParams({
    api_key:     ACTIVE_API_KEY,
    lat_lon:     `${lat},${lng}`,
    radius:      "50",
    num_results: "10",
    sort:        "date_asc",
    start_date:  new Date().toISOString().split("T")[0],
  });

  const res = await fetch(`https://api.amp.active.com/v2/search?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.results ?? [];
}

function normaliseActive(ev) {
  const lat = Number(ev.place?.geoPoint?.lat);
  const lng = Number(ev.place?.geoPoint?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const startsAt = ev.activityStartDate ? new Date(ev.activityStartDate) : null;
  if (!startsAt || startsAt.getTime() < Date.now()) return null;

  const title       = String(ev.assetName ?? "").trim();
  const description = stripHtml(ev.description ?? ev.metaDescription ?? "").slice(0, 600);
  if (!title) return null;

  const category  = detectCategory(title, description);
  const expiresAt = new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);

  return {
    source:    "active",
    sourceId:  String(ev.assetGuid ?? ev.assetId ?? ev.id ?? ""),
    sourceUrl: ev.registrationUrlFull ?? ev.url ?? "",

    title, description,
    emoji:    CATEGORY_EMOJI[category] ?? "📍",
    category, tags: [],

    kind: "paid", priceCents: null,

    startsAt, endsAt: null,

    location: {
      lat, lng,
      address:          ev.place?.addressLine1 ?? "",
      formattedAddress: [ev.place?.addressLine1, ev.place?.city, ev.place?.state, ev.place?.country].filter(Boolean).join(", "),
      city:        ev.place?.city    ?? "",
      state:       ev.place?.state   ?? "",
      country:     ev.place?.country ?? "",
      countryCode: ev.place?.country ?? "",
      geo: { type: "Point", coordinates: [lng, lat] },
    },

    organizer: { name: ev.organization ?? "", url: "" },
    attendance: 0, bannerImage: ev.imageUrl ?? "",

    status: "active", visibility: "public",
    fetchedAt: new Date(), expiresAt,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function progress(label, done, total) {
  const pct    = total ? Math.round((done / total) * 20) : 0;
  const filled = "█".repeat(pct).padEnd(20, "░");
  process.stdout.write(`\r  [${filled}] ${done}/${total}  ${label}        `);
}

// ─── Upsert helper ────────────────────────────────────────────────────────────

async function upsert(col, doc, stats) {
  if (!doc?.sourceId) { stats.skipped++; return; }
  try {
    const r = await col.updateOne(
      { source: doc.source, sourceId: doc.sourceId },
      { $set: doc },
      { upsert: true }
    );
    if (r.upsertedCount > 0) { stats.inserted++; stats.totalSaved++; }
    else if (r.modifiedCount > 0) { stats.updated++; stats.totalSaved++; }
    else stats.skipped++;
  } catch (e) {
    if (e.code === 11000) stats.skipped++;
    else stats.errors++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌎  Community Event Ingest — RunSignup + ACTIVE → MongoDB (external_events)\n");
  if (!ACTIVE_API_KEY) console.log("ℹ️   ACTIVE_API_KEY not set — only RunSignup source active\n");

  const client = new MongoClient(MONGODB_URI, { family: 4 });
  await client.connect();
  console.log("✅  MongoDB connected");

  const db  = client.db("assis_auth");
  const col = db.collection("external_events");

  await col.createIndex({ source: 1, sourceId: 1 }, { unique: true, background: true }).catch(() => {});
  await col.createIndex({ "location.geo": "2dsphere" }, { background: true }).catch(() => {});
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true }).catch(() => {});
  await col.createIndex({ category: 1 }, { background: true }).catch(() => {});
  await col.createIndex({ startsAt: 1 }, { background: true }).catch(() => {});
  console.log("✅  Indexes ensured\n");

  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, totalSaved: 0 };
  const total = CITIES.length;
  let done    = 0;

  for (const city of CITIES) {
    if (stats.totalSaved >= MAX_EVENTS) break;

    done++;
    progress(city.label, done, total);

    const eventsPerCity = Math.ceil((MAX_EVENTS - stats.totalSaved) / (total - done + 1));
    const perPage = Math.min(Math.max(eventsPerCity, 5), 20);

    // RunSignup
    try {
      const races = await fetchRunSignup(city.lat, city.lng, perPage);
      for (const raceEntry of races) {
        if (stats.totalSaved >= MAX_EVENTS) break;
        const doc = await normaliseRunSignup(raceEntry, city.lat, city.lng);
        if (doc) await upsert(col, doc, stats);
        else stats.skipped++;
      }
    } catch (e) {
      stats.errors++;
    }

    // ACTIVE Network (optional)
    if (stats.totalSaved < MAX_EVENTS && ACTIVE_API_KEY) {
      try {
        const activeResults = await fetchActive(city.lat, city.lng);
        for (const ev of activeResults) {
          if (stats.totalSaved >= MAX_EVENTS) break;
          const doc = normaliseActive(ev);
          if (doc) await upsert(col, doc, stats);
          else stats.skipped++;
        }
      } catch {
        stats.errors++;
      }
    }

    await sleep(500); // polite pause between cities
  }

  console.log("\n\n─────────────────────────────────────────");
  console.log(`✅  New events inserted  : ${stats.inserted}`);
  console.log(`🔄  Existing updated     : ${stats.updated}`);
  console.log(`⏭️   Skipped/no-op        : ${stats.skipped}`);
  console.log(`❌  Errors               : ${stats.errors}`);
  console.log(`📦  Total saved          : ${stats.totalSaved} / ${MAX_EVENTS}`);
  console.log("─────────────────────────────────────────\n");

  await client.close();
  console.log("Done.\n");
}

main().catch(e => { console.error(e); process.exit(1); });
