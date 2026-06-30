const { MongoClient } = require("mongodb");
const MONGODB_URI = "mongodb+srv://appuser:AppUser12345@cluste1.h7gpyav.mongodb.net/assis_auth?retryWrites=true&w=majority&appName=Cluste1";

async function fixRejectionNotifications() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("assis_auth");
    const rejectedEvents = await db.collection("events").find({
      "aiAnalysis.botDecision.action": "rejected"
    }).toArray();

    let updated = 0;
    for (const e of rejectedEvents) {
      if (!e.creatorClerkId) continue;
      
      const moderatorNote = `AI Risk Score: ${e.aiAnalysis.riskScore}/100 - ${e.aiAnalysis.summary || 'Content violates strict platform guidelines regarding suggestive or adult material.'} ${e.aiAnalysis.recommendation || 'Reject immediately.'}`;
      
      const res = await db.collection("notifications").updateOne(
        { type: "event_rejected", eventId: e._id.toString() },
        { 
          $set: { 
            message: `Your event "${e.title}" was rejected by moderation.`,
            moderatorNote: moderatorNote,
            flags: e.aiAnalysis.flags || [],
            approvalStatus: "rejected",
            riskScore: e.aiAnalysis.riskScore
          } 
        }
      );
      if (res.modifiedCount > 0) updated++;
      else if (res.matchedCount === 0) {
        await db.collection("notifications").insertOne({
          recipientClerkId: e.creatorClerkId,
          type: "event_rejected",
          eventId: e._id.toString(),
          eventTitle: e.title,
          message: `Your event "${e.title}" was rejected by moderation.`,
          moderatorNote: moderatorNote,
          flags: e.aiAnalysis.flags || [],
          approvalStatus: "rejected",
          riskScore: e.aiAnalysis.riskScore,
          read: false,
          createdAt: new Date(),
          sentByBot: true,
        });
        updated++;
      }
    }
    console.log(`Successfully fixed ${updated} rejection notifications.`);
  } finally {
    await client.close();
  }
}
fixRejectionNotifications();
