// scripts/ensure-indexes.ts
// ✅ Run this ONCE to create all performance-critical MongoDB indexes
// Usage: npx ts-node -e "require('./scripts/ensure-indexes.ts')"
// Or hit GET /api/admin/ensure-indexes (protected by ADMIN_SECRET)

import clientPromise from "../lib/mongodb";

export async function ensureIndexes() {
  const client = await clientPromise;
  const db = client.db("assis_auth");

  console.log("🔧 Creating MongoDB indexes...\n");
  const results: { collection: string; index: string; status: string }[] = [];

  // ─── events collection ───────────────────────────────────────────────────────
  const events = db.collection("events");

  // 1. Primary query index: status + endsAt — most common filter
  // Covers: { status: { $nin: [...] }, endsAt: { $gte: now } }
  await events.createIndex(
    { status: 1, endsAt: 1 },
    { name: "idx_status_endsAt", background: true }
  );
  results.push({ collection: "events", index: "idx_status_endsAt", status: "✅" });

  // 2. Compound sort index: createdAt + _id — for default sort + cursor pagination
  await events.createIndex(
    { createdAt: -1, _id: -1 },
    { name: "idx_createdAt_id_desc", background: true }
  );
  results.push({ collection: "events", index: "idx_createdAt_id_desc", status: "✅" });

  // 3. Status + createdAt — for the main filtered + sorted query
  // Covers: find({ status: $nin, ... }).sort({ createdAt: -1 })
  await events.createIndex(
    { status: 1, createdAt: -1 },
    { name: "idx_status_createdAt", background: true }
  );
  results.push({ collection: "events", index: "idx_status_createdAt", status: "✅" });

  // 4. Geospatial index for $near queries (location-based search)
  // Required for: query["location.geo"] = { $near: ... }
  await events.createIndex(
    { "location.geo": "2dsphere" },
    { name: "idx_location_geo_2dsphere", background: true }
  );
  results.push({ collection: "events", index: "idx_location_geo_2dsphere", status: "✅" });

  // 5. Location filter indexes — city/country browsing
  await events.createIndex(
    { "location.countryCode": 1, "location.admin1": 1, "location.cityKey": 1 },
    { name: "idx_location_hierarchy", background: true }
  );
  results.push({ collection: "events", index: "idx_location_hierarchy", status: "✅" });

  // 6. startsAt index — for upcomingOnly filter + expiry detection
  await events.createIndex(
    { startsAt: 1 },
    { name: "idx_startsAt", background: true }
  );
  results.push({ collection: "events", index: "idx_startsAt", status: "✅" });

  // 7. Visibility + status + createdAt — most common combined filter
  await events.createIndex(
    { visibility: 1, status: 1, createdAt: -1 },
    { name: "idx_visibility_status_createdAt", background: true }
  );
  results.push({ collection: "events", index: "idx_visibility_status_createdAt", status: "✅" });

  // 8. creatorClerkId — for "my events" queries + user map lookups
  await events.createIndex(
    { creatorClerkId: 1 },
    { name: "idx_creatorClerkId", background: true }
  );
  results.push({ collection: "events", index: "idx_creatorClerkId", status: "✅" });

  // 9. kind index — for free/paid filter
  await events.createIndex(
    { kind: 1 },
    { name: "idx_kind", background: true }
  );
  results.push({ collection: "events", index: "idx_kind", status: "✅" });

  // 10. Delta sync: updatedAt + createdAt — for ?since= queries
  await events.createIndex(
    { updatedAt: -1 },
    { name: "idx_updatedAt_desc", background: true }
  );
  results.push({ collection: "events", index: "idx_updatedAt_desc", status: "✅" });

  // 11. TTL index: auto-delete events 7 days after endsAt (optional, keeps DB clean)
  // Only creates if endsAt exists on document — safe for events without endsAt
  await events.createIndex(
    { endsAt: 1 },
    {
      name: "idx_endsAt_ttl",
      expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days after endsAt
      background: true,
      sparse: true, // Only index docs that HAVE endsAt field
    }
  );
  results.push({ collection: "events", index: "idx_endsAt_ttl (TTL, sparse)", status: "✅" });

  // ─── users collection ────────────────────────────────────────────────────────
  const users = db.collection("users");

  // 1. Primary lookup: clerkUserId — critical for user map join
  await users.createIndex(
    { clerkUserId: 1 },
    { name: "idx_clerkUserId", unique: true, background: true }
  );
  results.push({ collection: "users", index: "idx_clerkUserId (unique)", status: "✅" });

  // 2. Email index — for auth lookups
  await users.createIndex(
    { email: 1 },
    { name: "idx_email", sparse: true, background: true }
  );
  results.push({ collection: "users", index: "idx_email", status: "✅" });

  // ─── bookings collection ─────────────────────────────────────────────────────
  const bookings = db.collection("bookings");

  // 1. eventId + userId — most common booking query
  await bookings.createIndex(
    { eventId: 1, userId: 1 },
    { name: "idx_eventId_userId", background: true }
  );
  results.push({ collection: "bookings", index: "idx_eventId_userId", status: "✅" });

  // 2. userId — "my bookings" page
  await bookings.createIndex(
    { userId: 1 },
    { name: "idx_userId", background: true }
  );
  results.push({ collection: "bookings", index: "idx_userId", status: "✅" });

  // ─── messages collection ─────────────────────────────────────────────────────
  const messages = db.collection("messages");

  // 1. conversationId + createdAt — chat message ordering
  await messages.createIndex(
    { conversationId: 1, createdAt: -1 },
    { name: "idx_conversationId_createdAt", background: true }
  );
  results.push({ collection: "messages", index: "idx_conversationId_createdAt", status: "✅" });

  // 2. participants — for finding user's conversations
  await messages.createIndex(
    { participants: 1 },
    { name: "idx_participants", background: true }
  );
  results.push({ collection: "messages", index: "idx_participants", status: "✅" });

  // ─── Print results ───────────────────────────────────────────────────────────
  console.log("\n📊 Index Creation Results:");
  console.table(results);
  console.log(`\n✅ Done! Created ${results.length} indexes across ${new Set(results.map(r => r.collection)).size} collections.\n`);

  return results;
}

// Run directly if executed as a script
if (require.main === module) {
  ensureIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Index creation failed:", err);
      process.exit(1);
    });
}
