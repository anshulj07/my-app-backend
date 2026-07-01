const { MongoClient } = require("mongodb");

const MONGODB_URI = "mongodb+srv://appuser:AppUser12345@cluste1.h7gpyav.mongodb.net/assis_auth?retryWrites=true&w=majority&appName=Cluste1";

const highRiskEvents = [
  {
    title: "Underground Street Fight",
    description: "Unsanctioned bare-knuckle fighting event in the industrial district.",
    emoji: "🩸",
    bannerUri: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800&q=80",
    aiAnalysis: {
      riskScore: 98,
      riskLevel: "critical",
      flags: ["violence", "illegal_activity"],
      summary: "Highly violent unauthorized fighting event.",
      recommendation: "Reject and report.",
      imageAnalysis: { violence: 99, blood: 85 },
      botDecision: { action: "rejected", score: 98 }
    }
  },
  {
    title: "Exotic Swimwear Launch",
    description: "Launch party for a new highly revealing exotic swimwear collection.",
    emoji: "👙",
    bannerUri: "https://images.unsplash.com/photo-1582299533355-322197ce328c?w=800&q=80",
    aiAnalysis: {
      riskScore: 85,
      riskLevel: "high",
      flags: ["sexual_content", "nudity"],
      summary: "Suggestive adult clothing showcase.",
      recommendation: "Flag for manual review.",
      imageAnalysis: { sexual: 85, nudity: 60 },
      botDecision: { action: "flagged", score: 85 }
    }
  },
  {
    title: "Antique Firearms Auction",
    description: "Private auction featuring fully functional antique firearms and artillery.",
    emoji: "🔫",
    bannerUri: "https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=800&q=80",
    aiAnalysis: {
      riskScore: 88,
      riskLevel: "high",
      flags: ["weapons", "firearms"],
      summary: "Sale of restricted firearms.",
      recommendation: "Review licensing.",
      imageAnalysis: { weapons: 95 },
      botDecision: { action: "flagged", score: 88 }
    }
  },
  {
    title: "High Stakes Poker Night",
    description: "Unregulated high stakes gambling event with a $10,000 buy-in.",
    emoji: "🃏",
    bannerUri: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=800&q=80",
    aiAnalysis: {
      riskScore: 76,
      riskLevel: "high",
      flags: ["gambling", "illegal_activity"],
      summary: "Unregulated large scale gambling.",
      recommendation: "Review local gambling laws.",
      imageAnalysis: { gambling: 90 },
      botDecision: { action: "flagged", score: 76 }
    }
  },
  {
    title: "Psychedelic Exploration Retreat",
    description: "Guided retreat focusing on the consumption of psychedelic substances.",
    emoji: "🍄",
    bannerUri: "https://images.unsplash.com/photo-1584308666744-24d5e4a067ed?w=800&q=80",
    aiAnalysis: {
      riskScore: 92,
      riskLevel: "critical",
      flags: ["drugs", "illegal_substances"],
      summary: "Event promoting consumption of controlled substances.",
      recommendation: "Reject.",
      imageAnalysis: { drugs: 95 },
      botDecision: { action: "rejected", score: 92 }
    }
  },
  {
    title: "Midnight Street Racing",
    description: "Illegal street racing event on the highway.",
    emoji: "🏎️",
    bannerUri: "https://images.unsplash.com/photo-1509824227185-9c5a01ceba0d?w=800&q=80",
    aiAnalysis: {
      riskScore: 91,
      riskLevel: "critical",
      flags: ["illegal_activity", "reckless_behavior"],
      summary: "Promotion of illegal street racing.",
      recommendation: "Reject.",
      imageAnalysis: { violence: 20 },
      botDecision: { action: "rejected", score: 91 }
    }
  },
  {
    title: "Riot Training Camp",
    description: "Urban combat and riot participation training.",
    emoji: "🔥",
    bannerUri: "https://images.unsplash.com/photo-1531260796528-ae45a644234c?w=800&q=80",
    aiAnalysis: {
      riskScore: 97,
      riskLevel: "critical",
      flags: ["violence", "extremism"],
      summary: "Training for violent disruption.",
      recommendation: "Reject and report.",
      imageAnalysis: { violence: 98, weapons: 70 },
      botDecision: { action: "rejected", score: 97 }
    }
  },
  {
    title: "Open Bar Binge Fest",
    description: "Unlimited alcohol binge drinking competition.",
    emoji: "🍻",
    bannerUri: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80",
    aiAnalysis: {
      riskScore: 72,
      riskLevel: "medium",
      flags: ["alcohol", "self_harm"],
      summary: "Promotion of excessive alcohol consumption.",
      recommendation: "Age gate and review.",
      imageAnalysis: { alcohol: 95 },
      botDecision: { action: "approved_with_warnings", score: 72 }
    }
  },
  {
    title: "Adult Entertainment Expo",
    description: "Convention for the adult film industry and explicit content creators.",
    emoji: "🔞",
    bannerUri: "https://images.unsplash.com/photo-1518972553753-48b4566c1f10?w=800&q=80",
    aiAnalysis: {
      riskScore: 89,
      riskLevel: "high",
      flags: ["sexual_content", "adult_industry"],
      summary: "Adult entertainment convention.",
      recommendation: "Restrict visibility.",
      imageAnalysis: { sexual: 95, nudity: 75 },
      botDecision: { action: "flagged", score: 89 }
    }
  },
  {
    title: "Pyrotechnics Without Permits",
    description: "Massive unregulated fireworks and explosives demonstration in the desert.",
    emoji: "🧨",
    bannerUri: "https://images.unsplash.com/photo-1542385151-efd9000785a0?w=800&q=80",
    aiAnalysis: {
      riskScore: 82,
      riskLevel: "high",
      flags: ["weapons", "explosives", "illegal_activity"],
      summary: "Unregulated use of explosives.",
      recommendation: "Reject.",
      imageAnalysis: { fire: 99, weapons: 50 },
      botDecision: { action: "rejected", score: 82 }
    }
  }
];

const parsedEvents = highRiskEvents.map(e => ({
  ...e,
  creatorClerkId: "user_3FP39wG94zPnr5hJT3XNrRoE5N9",
  creatorName: "Soumya",
  kind: "free",
  date: "2026-07-25",
  time: "22:00",
  endDate: "2026-07-26",
  endTime: "04:00",
  timezone: "Asia/Kolkata",
  tags: ["Risk", "Alert"],
  status: "active",
  visibility: "public",
  location: {"city":"Indore","countryName":"India"},
  createdAt: new Date(),
  updatedAt: new Date(),
}));

parsedEvents.forEach(e => {
  e.startsAt = new Date(`${e.date}T${e.time}:00+05:30`);
  e.endsAt = new Date(`${e.endDate}T${e.endTime}:00+05:30`);
  if (isNaN(e.startsAt.getTime())) e.startsAt = new Date();
  if (isNaN(e.endsAt.getTime())) e.endsAt = new Date();
});

async function seed() {
  console.log("Connecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("assis_auth");
    
    const result = await db.collection("events").insertMany(parsedEvents);
    console.log(`Successfully inserted ${result.insertedCount} high-risk events.`);
  } catch (error) {
    console.error("Error inserting events:", error);
  } finally {
    await client.close();
  }
}

seed();
