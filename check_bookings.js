const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('assis_auth');
  const bookings = await db.collection('bookings').find({
    status: { $in: ['confirmed', 'payment_pending', 'paid_pending_approval'] }
  }).toArray();
  console.log(JSON.stringify(bookings, null, 2));
  await client.close();
}

run();
