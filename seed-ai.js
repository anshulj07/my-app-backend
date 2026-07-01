const { MongoClient } = require("mongodb");

const MONGODB_URI = "mongodb+srv://appuser:AppUser12345@cluste1.h7gpyav.mongodb.net/assis_auth?retryWrites=true&w=majority&appName=Cluste1";

const eventsData = [
 {
 "title": "Global AI Summit 2026",
 "description": "Join AI researchers, developers and founders for workshops, networking and keynote sessions on artificial intelligence.",
 "emoji": "🤖",
 "creatorClerkId": "user_3FP39wG94zPnr5hJT3XNrRoE5N9",
 "creatorName": "Soumya",
 "kind": "free",
 "date": "2026-07-15",
 "time": "10:00",
 "endDate": "2026-07-15",
 "endTime": "18:00",
 "timezone": "Asia/Kolkata",
 "bannerUri": "https://example.com/images/ai-summit.jpg",
 "tags": ["AI","Technology","Conference"],
 "status": "active",
 "visibility": "public",
 "location": {"city":"Indore","countryName":"India"},
 "aiAnalysis": {
 "riskScore": 8,
 "riskLevel": "low",
 "flags": [],
 "summary": "Legitimate technology conference.",
 "recommendation": "Approve.",
 "imageAnalysis": {"sexual":0,"nudity":0,"violence":0,"weapons":0,"drugs":0},
 "botDecision":{"action":"approved","score":8}
 }
 },
 {
 "title":"Blood Donation Camp",
 "description":"Community blood donation drive organized by local hospitals.",
 "emoji":"🩸",
 "bannerUri":"https://example.com/images/blood-camp.jpg",
 "aiAnalysis":{"riskScore":3,"riskLevel":"low","flags":[],"summary":"Safe community event.","recommendation":"Approve.","imageAnalysis":{"sexual":0,"nudity":0,"violence":0},"botDecision":{"action":"approved","score":3}}
 },
 {
 "title":"Startup Networking Meetup",
 "description":"Meet founders, investors and developers.",
 "emoji":"🚀",
 "bannerUri":"https://example.com/images/startup.jpg",
 "aiAnalysis":{"riskScore":6,"riskLevel":"low","flags":[],"summary":"Professional meetup.","recommendation":"Approve.","imageAnalysis":{"sexual":0,"nudity":0},"botDecision":{"action":"approved","score":6}}
 },
 {
 "title":"Yoga & Wellness Retreat",
 "description":"Morning yoga, meditation and healthy lifestyle workshops.",
 "emoji":"🧘",
 "bannerUri":"https://example.com/images/yoga.jpg",
 "aiAnalysis":{"riskScore":4,"riskLevel":"low","flags":[],"summary":"Healthy wellness event.","recommendation":"Approve.","imageAnalysis":{"sexual":0,"nudity":0},"botDecision":{"action":"approved","score":4}}
 },
 {
 "title":"College Hackathon",
 "description":"24-hour coding competition for students.",
 "emoji":"💻",
 "bannerUri":"https://example.com/images/hackathon.jpg",
 "aiAnalysis":{"riskScore":7,"riskLevel":"low","flags":[],"summary":"Educational event.","recommendation":"Approve."}
 },
 {
 "title":"Beach Pool Party",
 "description":"Summer beach party with pool games and DJ.",
 "emoji":"🏖️",
 "bannerUri":"https://example.com/images/beach-party.jpg",
 "aiAnalysis":{"riskScore":42,"riskLevel":"medium","flags":["suggestive_imagery"],"summary":"Suggestive promotional content.","recommendation":"Manual review.","imageAnalysis":{"sexual":38,"nudity":5},"botDecision":{"action":"approved_with_warnings","score":42}}
 },
 {
 "title":"Lingerie Fashion Showcase",
 "description":"Fashion runway showcasing lingerie collections for industry professionals.",
 "emoji":"👗",
 "bannerUri":"https://example.com/images/lingerie.jpg",
 "aiAnalysis":{"riskScore":83,"riskLevel":"high","flags":["sexual_content"],"summary":"Contains sexualized imagery.","recommendation":"Manual review.","imageAnalysis":{"sexual":88,"nudity":20},"botDecision":{"action":"flagged","score":83}}
 },
 {
 "title":"Classical Nude Art Exhibition",
 "description":"Museum exhibition featuring classical nude sculptures and paintings.",
 "emoji":"🖼️",
 "bannerUri":"https://example.com/images/nude-art.jpg",
 "aiAnalysis":{"riskScore":74,"riskLevel":"medium","flags":["nudity"],"summary":"Artistic nudity detected.","recommendation":"Review context before approval.","imageAnalysis":{"sexual":15,"nudity":92},"botDecision":{"action":"approved_with_warnings","score":74}}
 },
 {
 "title":"Underground Fight Club",
 "description":"Promotional page depicting organized violent fighting.",
 "emoji":"🥊",
 "bannerUri":"https://example.com/images/fight-club.jpg",
 "aiAnalysis":{"riskScore":95,"riskLevel":"critical","flags":["violence"],"summary":"Graphic violence indicators.","recommendation":"Reject.","imageAnalysis":{"violence":95},"botDecision":{"action":"rejected","score":95}}
 },
 {
 "title":"Weapon Collector Expo",
 "description":"Exhibition displaying historical and modern weapons.",
 "emoji":"🔫",
 "bannerUri":"https://example.com/images/weapons.jpg",
 "aiAnalysis":{"riskScore":78,"riskLevel":"high","flags":["weapons"],"summary":"Weapons visible in promotional material.","recommendation":"Manual review.","imageAnalysis":{"weapons":96},"botDecision":{"action":"flagged","score":78}}
 },
 {
 "title":"Drug Awareness Seminar",
 "description":"Educational seminar about drug abuse prevention and rehabilitation.",
 "emoji":"💊",
 "bannerUri":"https://example.com/images/drug-awareness.jpg",
 "aiAnalysis":{"riskScore":28,"riskLevel":"low","flags":["drug_reference"],"summary":"Drug references appear educational.","recommendation":"Approve.","imageAnalysis":{"drugs":25},"botDecision":{"action":"approved","score":28}}
 },
 {
 "title":"Casino Night Gala",
 "description":"Charity fundraising evening with casino-themed games.",
 "emoji":"🎰",
 "bannerUri":"https://example.com/images/casino.jpg",
 "aiAnalysis":{"riskScore":48,"riskLevel":"medium","flags":["gambling"],"summary":"Gambling theme detected.","recommendation":"Review regional policy.","imageAnalysis":{"gambling":82},"botDecision":{"action":"approved_with_warnings","score":48}}
 },
 {
 "title":"Crypto Investment Workshop",
 "description":"Educational blockchain and crypto investing basics.",
 "emoji":"₿",
 "bannerUri":"https://example.com/images/crypto.jpg",
 "aiAnalysis":{"riskScore":25,"riskLevel":"low","flags":[],"summary":"Educational financial content.","recommendation":"Approve."}
 },
 {
 "title":"City Marathon",
 "description":"Annual marathon promoting fitness and community participation.",
 "emoji":"🏃",
 "bannerUri":"https://example.com/images/marathon.jpg",
 "aiAnalysis":{"riskScore":2,"riskLevel":"low","flags":[],"summary":"Safe sports event.","recommendation":"Approve."}
 },
 {
 "title":"Music Festival",
 "description":"Outdoor live music festival with food stalls and performances.",
 "emoji":"🎵",
 "bannerUri":"https://example.com/images/music-festival.jpg",
 "aiAnalysis":{"riskScore":15,"riskLevel":"low","flags":[],"summary":"Normal entertainment event.","recommendation":"Approve.","imageAnalysis":{"sexual":3,"violence":0},"botDecision":{"action":"approved","score":15}}
 }
];

const parsedEvents = eventsData.map(e => ({
  ...e,
  creatorClerkId: e.creatorClerkId || "user_3FP39wG94zPnr5hJT3XNrRoE5N9",
  creatorName: e.creatorName || "Soumya",
  kind: e.kind || "free",
  date: e.date || "2026-07-20",
  time: e.time || "10:00",
  endDate: e.endDate || e.date || "2026-07-20",
  endTime: e.endTime || "18:00",
  timezone: e.timezone || "Asia/Kolkata",
  tags: e.tags || ["Event"],
  status: e.status || "active",
  visibility: e.visibility || "public",
  location: e.location || {"city":"Indore","countryName":"India"},
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
    console.log(`Successfully inserted ${result.insertedCount} events.`);
  } catch (error) {
    console.error("Error inserting events:", error);
  } finally {
    await client.close();
  }
}

seed();
