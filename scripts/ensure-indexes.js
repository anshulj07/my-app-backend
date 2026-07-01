// scripts/ensure-indexes.js
// ✅ Plain JavaScript version — run with: node scripts/ensure-indexes.js
// No TypeScript compilation needed!

const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

// ✅ Manually parse .env file (no dotenv dependency needed)
function loadEnv() {
  const envPath = path.join(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ✅ Safe wrapper: skips if index already exists (same keys, any name)
async function safeCreateIndex(col, keys, opts) {
  try {
    await col.createIndex(keys, opts);
  } catch (err) {
    if (
      err.code === 85 || // IndexOptionsConflict
      err.code === 86 || // IndexKeySpecsConflict
      (err.message && err.message.includes("already exists"))
    ) {
      console.log(`  ⚠️  Index for ${JSON.stringify(keys)} already exists (skipping)`);
    } else {
      throw err;
    }
  }
}

async function ensureIndexes() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI in .env");

  const client = new MongoClient(uri, { family: 4 });
  await client.connect();
  const db = client.db("assis_auth");

  console.log("🔧 Creating MongoDB indexes...\n");
  const results = [];

  // ─── events collection ───────────────────────────────────────────────────────
  const events = db.collection("events");

  // 1. status + endsAt — primary query filter
  await safeCreateIndex(events, { status: 1, endsAt: 1 }, { name: "idx_status_endsAt", background: true });
  results.push({ collection: "events", index: "idx_status_endsAt" });

  // 2. createdAt + _id — default sort + cursor pagination
  await safeCreateIndex(events, { createdAt: -1, _id: -1 }, { name: "idx_createdAt_id_desc", background: true });
  results.push({ collection: "events", index: "idx_createdAt_id_desc" });

  // 3. status + createdAt — filtered + sorted query
  await safeCreateIndex(events, { status: 1, createdAt: -1 }, { name: "idx_status_createdAt", background: true });
  results.push({ collection: "events", index: "idx_status_createdAt" });

  // 4. Geospatial 2dsphere — for $near / location-based queries
  await safeCreateIndex(events, { "location.geo": "2dsphere" }, { name: "idx_location_geo_2dsphere", background: true });
  results.push({ collection: "events", index: "idx_location_geo_2dsphere" });


  // 5. Location hierarchy — city/country browsing
  await safeCreateIndex(
    events,
    { "location.countryCode": 1, "location.admin1": 1, "location.cityKey": 1 },
    { name: "idx_location_hierarchy", background: true }
  );
  results.push({ collection: "events", index: "idx_location_hierarchy" });

  // 6. startsAt — upcomingOnly filter + expiry detection
  await safeCreateIndex(events, { startsAt: 1 }, { name: "idx_startsAt", background: true });
  results.push({ collection: "events", index: "idx_startsAt" });

  // 7. visibility + status + createdAt — most common combined filter
  await safeCreateIndex(
    events,
    { visibility: 1, status: 1, createdAt: -1 },
    { name: "idx_visibility_status_createdAt", background: true }
  );
  results.push({ collection: "events", index: "idx_visibility_status_createdAt" });

  // 8. creatorClerkId — "my events" + user map lookup
  await safeCreateIndex(events, { creatorClerkId: 1 }, { name: "idx_creatorClerkId", background: true });
  results.push({ collection: "events", index: "idx_creatorClerkId" });

  // 9. kind — free/paid filter
  await safeCreateIndex(events, { kind: 1 }, { name: "idx_kind", background: true });
  results.push({ collection: "events", index: "idx_kind" });

  // 10. updatedAt — delta sync (?since= queries)
  await safeCreateIndex(events, { updatedAt: -1 }, { name: "idx_updatedAt_desc", background: true });
  results.push({ collection: "events", index: "idx_updatedAt_desc" });

  // 11. endsAt TTL — auto-delete events 7 days after they end (keeps DB clean)
  await safeCreateIndex(
    events,
    { endsAt: 1 },
    { name: "idx_endsAt_ttl", expireAfterSeconds: 7 * 24 * 60 * 60, background: true, sparse: true }
  );
  results.push({ collection: "events", index: "idx_endsAt_ttl (TTL, sparse, 7d)" });

  // ─── users collection ────────────────────────────────────────────────────────
  const users = db.collection("users");

  await safeCreateIndex(users, { clerkUserId: 1 }, { name: "idx_clerkUserId", unique: true, background: true });
  results.push({ collection: "users", index: "idx_clerkUserId (unique)" });

  await safeCreateIndex(users, { email: 1 }, { name: "idx_email", sparse: true, background: true });
  results.push({ collection: "users", index: "idx_email" });

  // ─── bookings collection ─────────────────────────────────────────────────────
  const bookings = db.collection("bookings");

  await safeCreateIndex(bookings, { eventId: 1, userId: 1 }, { name: "idx_eventId_userId", background: true });
  results.push({ collection: "bookings", index: "idx_eventId_userId" });

  await safeCreateIndex(bookings, { userId: 1 }, { name: "idx_userId", background: true });
  results.push({ collection: "bookings", index: "idx_userId" });

  // ─── messages collection ─────────────────────────────────────────────────────
  const messages = db.collection("messages");

  await safeCreateIndex(messages, { conversationId: 1, createdAt: -1 }, { name: "idx_conversationId_createdAt", background: true });
  results.push({ collection: "messages", index: "idx_conversationId_createdAt" });

  await safeCreateIndex(messages, { participants: 1 }, { name: "idx_participants", background: true });
  results.push({ collection: "messages", index: "idx_participants" });

  // ─── Print results ───────────────────────────────────────────────────────────
  console.log("\n📊 Results:");
  const byCollection = {};
  for (const r of results) {
    if (!byCollection[r.collection]) byCollection[r.collection] = [];
    byCollection[r.collection].push("✅ " + r.index);
  }
  for (const [col, indexes] of Object.entries(byCollection)) {
    console.log(`\n  ${col}:`);
    indexes.forEach(i => console.log(`    ${i}`));
  }
  console.log(`\n✅ Done! Created/verified ${results.length} indexes.\n`);

  await client.close();
  return results;
}

ensureIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  });
