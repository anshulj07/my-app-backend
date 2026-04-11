import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

async function fixAttendeeNames() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not found");
    return;
  }

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("assis_auth");
    const events = await db.collection("events").find({}).toArray();

    console.log(`Checking ${events.length} events...`);

    for (const ev of events) {
      let updated = false;
      const eventId = ev._id;
      
      // Fix Attendees
      if (Array.isArray(ev.attendees)) {
        for (const att of ev.attendees) {
          if (att.name === "Attendee" || !att.name || att.name === "Guest") {
             const user = await db.collection("users").findOne({ clerkUserId: att.clerkId });
             if (user?.profile?.firstName) {
               att.name = `${user.profile.firstName} ${user.profile.lastName || ""}`.trim();
               att.imageUrl = user.profile.avatar?.url || att.imageUrl || "";
               updated = true;
               console.log(`Fixed attendee ${att.clerkId} in event ${eventId}`);
             }
          }
        }
      }

      // Fix Pending Requests
      if (Array.isArray(ev.pendingRequests)) {
        for (const pr of ev.pendingRequests) {
          if (pr.name === "Attendee" || !pr.name || pr.name === "Guest") {
            const user = await db.collection("users").findOne({ clerkUserId: pr.clerkUserId });
            if (user?.profile?.firstName) {
              pr.name = `${user.profile.firstName} ${user.profile.lastName || ""}`.trim();
              pr.imageUrl = user.profile.avatar?.url || pr.imageUrl || "";
              updated = true;
              console.log(`Fixed pending request ${pr.clerkUserId} in event ${eventId}`);
            }
          }
        }
      }

      if (updated) {
        await db.collection("events").updateOne(
          { _id: eventId },
          { $set: { attendees: ev.attendees, pendingRequests: ev.pendingRequests } }
        );
      }
    }

    console.log("Legacy identity cleanup complete.");
  } finally {
    await client.close();
  }
}

fixAttendeeNames();
