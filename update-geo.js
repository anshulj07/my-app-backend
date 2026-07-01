const { MongoClient } = require("mongodb");

const MONGODB_URI = "mongodb+srv://appuser:AppUser12345@cluste1.h7gpyav.mongodb.net/assis_auth?retryWrites=true&w=majority&appName=Cluste1";

// Indore coords: 22.7196, 75.8577
function getRandomOffset() {
  return (Math.random() - 0.5) * 0.1; 
}

async function fix() {
  console.log("Connecting to DB...");
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("assis_auth");
    const events = await db.collection("events").find({}).toArray();
    
    let count = 0;
    for (const e of events) {
      const hasLat = e.location && typeof e.location.lat === 'number';
      const hasTopLat = typeof e.lat === 'number';
      
      if (!hasLat && !hasTopLat) {
        const lat = 22.7196 + getRandomOffset();
        const lng = 75.8577 + getRandomOffset();
        const loc = {
          ...(e.location || {}),
          lat,
          lng,
          geo: {
            type: "Point",
            coordinates: [lng, lat]
          }
        };
        await db.collection("events").updateOne({ _id: e._id }, { $set: { location: loc, lat, lng } });
        count++;
      }
    }
    console.log("Updated", count, "events with random geo coordinates near Indore.");
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
  }
}
fix();
