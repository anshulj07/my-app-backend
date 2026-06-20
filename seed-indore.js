const { MongoClient } = require("mongodb");

const MONGODB_URI = "mongodb+srv://appuser:AppUser12345@cluste1.h7gpyav.mongodb.net/assis_auth?retryWrites=true&w=majority&appName=Cluste1";

const eventsData = [
  {
    title: "Indore Food Festival",
    description: "Experience the famous street food of Indore at 56 Dukan.",
    emoji: "🍔",
    creatorClerkId: "user_3FOqIsfDzA3Hh8Q05yt25IgQdNc",
    creatorName: "Soumya",
    kind: "free",
    priceCents: null,
    joinPolicy: "open",
    attendance: null,
    capacity: 200,
    attendees: [],
    pendingRequests: [],
    date: "2026-06-25",
    time: "18:00",
    endDate: "2026-06-25",
    endTime: "23:00",
    timezone: "Asia/Kolkata",
    tags: ["food", "festival"],
    visibility: "public",
    status: "active",
    location: {
      lat: 22.7244,
      lng: 75.8839,
      formattedAddress: "56 Dukan, Indore, Madhya Pradesh, India",
      placeId: "ChIJbU60yXAWrjsR4E9-UejD3_g_indore1",
      countryCode: "IN",
      countryName: "India",
      admin1: "Madhya Pradesh",
      admin1Code: "MP",
      city: "Indore",
      cityKey: "indore",
      postalCode: "",
      neighborhood: "56 Dukan",
      source: "places_autocomplete",
      geo: {
        type: "Point",
        coordinates: [75.8839, 22.7244]
      }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    bannerUri: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
    startsAt: new Date("2026-06-25T12:30:00.000Z"),
    endsAt: new Date("2026-06-25T17:30:00.000Z")
  },
  {
    title: "Startup Meetup Indore",
    description: "Networking event for founders and investors in central India.",
    emoji: "🚀",
    creatorClerkId: "user_3FOqIsfDzA3Hh8Q05yt25IgQdNc",
    creatorName: "Soumya",
    kind: "paid",
    priceCents: 50000,
    joinPolicy: "approval",
    attendance: null,
    capacity: 50,
    attendees: [],
    pendingRequests: [],
    date: "2026-07-02",
    time: "10:00",
    endDate: "2026-07-02",
    endTime: "14:00",
    timezone: "Asia/Kolkata",
    tags: ["startup", "networking"],
    visibility: "public",
    status: "active",
    location: {
      lat: 22.7533,
      lng: 75.8937,
      formattedAddress: "Vijay Nagar, Indore, Madhya Pradesh, India",
      placeId: "ChIJbU60yXAWrjsR4E9-UejD3_g_indore2",
      countryCode: "IN",
      countryName: "India",
      admin1: "Madhya Pradesh",
      admin1Code: "MP",
      city: "Indore",
      cityKey: "indore",
      postalCode: "452010",
      neighborhood: "Vijay Nagar",
      source: "places_autocomplete",
      geo: {
        type: "Point",
        coordinates: [75.8937, 22.7533]
      }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    bannerUri: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80",
    startsAt: new Date("2026-07-02T04:30:00.000Z"),
    endsAt: new Date("2026-07-02T08:30:00.000Z")
  },
  {
    title: "Rajwada Heritage Walk",
    description: "Explore the historical Rajwada palace and nearby markets.",
    emoji: "🏰",
    creatorClerkId: "user_3FOqIsfDzA3Hh8Q05yt25IgQdNc",
    creatorName: "Soumya",
    kind: "free",
    priceCents: null,
    joinPolicy: "open",
    attendance: null,
    capacity: 30,
    attendees: [],
    pendingRequests: [],
    date: "2026-07-15",
    time: "07:00",
    endDate: "2026-07-15",
    endTime: "10:00",
    timezone: "Asia/Kolkata",
    tags: ["heritage", "walk"],
    visibility: "public",
    status: "active",
    location: {
      lat: 22.7186,
      lng: 75.8557,
      formattedAddress: "Rajwada, Indore, Madhya Pradesh, India",
      placeId: "ChIJbU60yXAWrjsR4E9-UejD3_g_indore3",
      countryCode: "IN",
      countryName: "India",
      admin1: "Madhya Pradesh",
      admin1Code: "MP",
      city: "Indore",
      cityKey: "indore",
      postalCode: "",
      neighborhood: "Rajwada",
      source: "places_autocomplete",
      geo: {
        type: "Point",
        coordinates: [75.8557, 22.7186]
      }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    bannerUri: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?w=800&q=80",
    startsAt: new Date("2026-07-15T01:30:00.000Z"),
    endsAt: new Date("2026-07-15T04:30:00.000Z")
  },
  {
    title: "Trekking at Patalpani",
    description: "Weekend trek to the beautiful Patalpani waterfall.",
    emoji: "⛰️",
    creatorClerkId: "user_3FOqIsfDzA3Hh8Q05yt25IgQdNc",
    creatorName: "Soumya",
    kind: "paid",
    priceCents: 80000,
    joinPolicy: "open",
    attendance: null,
    capacity: 25,
    attendees: [],
    pendingRequests: [],
    date: "2026-08-05",
    time: "06:00",
    endDate: "2026-08-05",
    endTime: "14:00",
    timezone: "Asia/Kolkata",
    tags: ["trekking", "nature"],
    visibility: "public",
    status: "active",
    location: {
      lat: 22.5694,
      lng: 75.8000,
      formattedAddress: "Patalpani, Mhow, Indore, Madhya Pradesh, India",
      placeId: "ChIJbU60yXAWrjsR4E9-UejD3_g_indore4",
      countryCode: "IN",
      countryName: "India",
      admin1: "Madhya Pradesh",
      admin1Code: "MP",
      city: "Indore",
      cityKey: "indore",
      postalCode: "",
      neighborhood: "Mhow",
      source: "places_autocomplete",
      geo: {
        type: "Point",
        coordinates: [75.8000, 22.5694]
      }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    bannerUri: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80",
    startsAt: new Date("2026-08-05T00:30:00.000Z"),
    endsAt: new Date("2026-08-05T08:30:00.000Z")
  },
  {
    title: "Indore Music Fest",
    description: "Live concert featuring top local bands.",
    emoji: "🎤",
    creatorClerkId: "user_3FOqIsfDzA3Hh8Q05yt25IgQdNc",
    creatorName: "Soumya",
    kind: "paid",
    priceCents: 150000,
    joinPolicy: "approval",
    attendance: null,
    capacity: 500,
    attendees: [],
    pendingRequests: [],
    date: "2026-08-20",
    time: "19:00",
    endDate: "2026-08-20",
    endTime: "23:59",
    timezone: "Asia/Kolkata",
    tags: ["music", "concert"],
    visibility: "public",
    status: "active",
    location: {
      lat: 22.6900,
      lng: 75.8700,
      formattedAddress: "Bhawarkua, Indore, Madhya Pradesh, India",
      placeId: "ChIJbU60yXAWrjsR4E9-UejD3_g_indore5",
      countryCode: "IN",
      countryName: "India",
      admin1: "Madhya Pradesh",
      admin1Code: "MP",
      city: "Indore",
      cityKey: "indore",
      postalCode: "",
      neighborhood: "Bhawarkua",
      source: "places_autocomplete",
      geo: {
        type: "Point",
        coordinates: [75.8700, 22.6900]
      }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    bannerUri: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80",
    startsAt: new Date("2026-08-20T13:30:00.000Z"),
    endsAt: new Date("2026-08-20T18:29:00.000Z")
  }
];

async function seed() {
  console.log("Connecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("assis_auth");
    const result = await db.collection("events").insertMany(eventsData);
    console.log(`Successfully inserted ${result.insertedCount} Indore events.`);
  } catch (error) {
    console.error("Error inserting events:", error);
  } finally {
    await client.close();
  }
}

seed();
