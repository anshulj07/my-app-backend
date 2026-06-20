const { MongoClient } = require("mongodb");

const MONGODB_URI = "mongodb+srv://appuser:AppUser12345@cluste1.h7gpyav.mongodb.net/assis_auth?retryWrites=true&w=majority&appName=Cluste1";

async function verifyAll() {
  console.log("Connecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("assis_auth");
    
    const result = await db.collection("users").updateMany(
      { "profile.verificationStatus": "pending" },
      { 
        $set: { 
          "profile.verificationStatus": "verified",
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`Successfully verified ${result.modifiedCount} pending users.`);
  } catch (error) {
    console.error("Error verifying users:", error);
  } finally {
    await client.close();
  }
}

verifyAll();
