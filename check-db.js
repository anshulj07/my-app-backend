const { MongoClient } = require('mongodb');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const uriMatch = env.match(/MONGODB_URI=(.*)/);
process.env.MONGODB_URI = uriMatch ? uriMatch[1] : '';

async function run() {
  console.log("URI:", process.env.MONGODB_URI ? "Exists" : "Missing");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('assis_auth');
  const res = await fetch("https://yolando-diadromous-nicki.ngrok-free.dev/api/bookings/my-bookings?clerkUserId=user_3C6zg9qLTPNOekxlqWRngXJSvJ6", { headers: { "x-api-key": "super-secret" } });
  const data = await res.json();
  const events = data.createdEvents || [];
  console.log(`Ngrok returned ${events.length} events`);
  for (const e of events) {
    if (e.title.toLowerCase().includes('spam') || e.title === 'Ai Spam') {
      console.log("FOUND NG-ROK Ai Spam:", e.title, "ID:", e._id, "status:", e.status, "admin_status:", e.admin_status);
    }
  }
  await client.close();
}
run().catch(console.error);
