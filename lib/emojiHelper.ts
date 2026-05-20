/**
 * Returns a smart contextual emoji based on keywords found in the event title.
 * If no keywords match, it returns the provided default emoji (typically "📍" or "✨").
 */
export function getSmartEmojiFromTitle(title: string, defaultEmoji: string = "📍"): string {
  const t = title.toLowerCase();

  // Sports
  if (t.includes("cricket") || t.includes("ipl") || t.includes("t20") || t.includes("bat ")) return "🏏";
  if (t.includes("basketball") || t.includes("nba") || t.includes("dunk")) return "🏀";
  if (t.includes("soccer") || t.includes("football club") || t.includes("premier league") || t.includes("fc ")) return "⚽";
  if (t.includes("football") || t.includes("nfl") || t.includes("super bowl")) return "🏈";
  if (t.includes("baseball") || t.includes("mlb")) return "⚾";
  if (t.includes("hockey") || t.includes("nhl") || t.includes("ice hockey")) return "🏒";
  if (t.includes("tennis") || t.includes("wimbledon")) return "🎾";
  if (t.includes("badminton") || t.includes("shuttlecock")) return "🏸";
  if (t.includes("golf") || t.includes("pga")) return "⛳";
  if (t.includes("boxing") || t.includes("mma") || t.includes("wrestling") || t.includes("wwe") || t.includes("ufc") || t.includes("fight") || t.includes("brawl")) return "🥊";
  if (t.includes("racing") || t.includes("nascar") || t.includes("formula 1") || t.includes("formulaone") || t.includes("f1") || t.includes("grand prix") || t.includes("motogp")) return "🏎️";
  if (t.includes("marathon") || t.includes("run") || t.includes("race") || t.includes("5k") || t.includes("10k") || t.includes("track & field") || t.includes("athletics")) return "🏃";
  if (t.includes("cycle") || t.includes("cycling") || t.includes("bicycle") || t.includes("bike")) return "🚴";
  if (t.includes("swim") || t.includes("swimming") || t.includes("pool") || t.includes("diving")) return "🏊";
  if (t.includes("yoga") || t.includes("wellness") || t.includes("meditation") || t.includes("stretch") || t.includes("breathwork") || t.includes("mindfulness")) return "🧘";
  if (t.includes("gymnastics")) return "🤸";
  
  // Music & Entertainment
  if (t.includes("rock") || t.includes("band") || t.includes("guitar") || t.includes("concert") || t.includes("live music")) return "🎸";
  if (t.includes("rap") || t.includes("hip-hop") || t.includes("hip hop") || t.includes("rapper") || t.includes("singing") || t.includes("karaoke")) return "🎤";
  if (t.includes("comedy") || t.includes("stand up") || t.includes("standup") || t.includes("stand-up") || t.includes("laugh") || t.includes("humor") || t.includes("joke")) return "😂";
  if (t.includes("magic") || t.includes("illusion") || t.includes("magician") || t.includes("illusionist")) return "🪄";
  if (t.includes("disco") || t.includes("dj ") || t.includes("dance party") || t.includes("edm") || t.includes("rave") || t.includes("nightclub") || t.includes("electronic music")) return "🎧";
  if (t.includes("jazz") || t.includes("sax") || t.includes("saxophone")) return "🎷";
  if (t.includes("classical") || t.includes("orchestra") || t.includes("symphony") || t.includes("violin") || t.includes("opera")) return "🎻";
  
  // Art & Theater
  if (t.includes("art ") || t.includes("gallery") || t.includes("museum") || t.includes("exhibit") || t.includes("exhibition") || t.includes("paint") || t.includes("drawing") || t.includes("craft")) return "🎨";
  if (t.includes("theatre") || t.includes("theater") || t.includes("broadway") || t.includes("musical") || t.includes("drama") || t.includes("play") || t.includes("revue") || t.includes("cabaret") || t.includes("drag")) return "🎭";
  if (t.includes("ballet") || t.includes("dance") || t.includes("salsa") || t.includes("bachata") || t.includes("tango")) return "💃";
  
  // Business, Tech & Training
  if (t.includes("corporate") || t.includes("business") || t.includes("conference") || t.includes("summit") || t.includes("expo") || t.includes("startup") || t.includes("networking") || t.includes("meetup") || t.includes("meeting") || t.includes("seminar") || t.includes("work")) return "💼";
  if (t.includes("training") || t.includes("course") || t.includes("workshop") || t.includes("class") || t.includes("learn") || t.includes("bootcamp") || t.includes("webinar") || t.includes("tutorial")) return "📚";
  if (t.includes("tech") || t.includes("code") || t.includes("coding") || t.includes("developer") || t.includes("hackathon") || t.includes("software") || t.includes("computer")) return "💻";

  // Food & Drink
  if (t.includes("food") || t.includes("dinner") || t.includes("brunch") || t.includes("lunch") || t.includes("breakfast") || t.includes("feast") || t.includes("dining") || t.includes("tasting") || t.includes("restaurant") || t.includes("cook") || t.includes("eat")) return "🍽️";
  if (t.includes("wine") || t.includes("beer") || t.includes("cocktail") || t.includes("brewery") || t.includes("pub") || t.includes("bar ") || t.includes("whiskey") || t.includes("spirit")) return "🍷";
  if (t.includes("coffee") || t.includes("tea ") || t.includes("cafe")) return "☕";
  
  // Family & Kids
  if (t.includes("kids") || t.includes("children") || t.includes("family") || t.includes("toddler") || t.includes("disney") || t.includes("circus")) return "👨‍👩‍👧‍👦";
  
  // Travel & Adventure
  if (t.includes("tour") || t.includes("scavenger") || t.includes("adventure") || t.includes("trip") || t.includes("walk") || t.includes("walking") || t.includes("travel") || t.includes("explore") || t.includes("safari")) return "✈️";

  // Holiday / Seasonal
  if (t.includes("halloween") || t.includes("horror") || t.includes("spooky") || t.includes("ghost")) return "👻";
  if (t.includes("christmas") || t.includes("xmas") || t.includes("holiday") || t.includes("santa")) return "🎄";
  if (t.includes("new year") || t.includes("nye") || t.includes("fireworks")) return "🎆";

  // Shopping & Market
  if (t.includes("market") || t.includes("fair") || t.includes("bazaar") || t.includes("shop") || t.includes("sale") || t.includes("store")) return "🛍️";

  // Services & Trades
  if (t.includes("clean") || t.includes("maid") || t.includes("janitor") || t.includes("housekeeping") || t.includes("laundry") || t.includes("wash")) return "🧹";
  if (t.includes("plumber") || t.includes("plumbing") || t.includes("pipe") || t.includes("leak") || t.includes("drain")) return "🔧";
  if (t.includes("electric") || t.includes("wiring") || t.includes("power") || t.includes("voltage")) return "⚡";
  if (t.includes("painter") || t.includes("painting") || t.includes("paint job")) return "🖌️";
  if (t.includes("repair") || t.includes("fix") || t.includes("handyman") || t.includes("mechanic") || t.includes("install") || t.includes("maintenance")) return "🛠️";
  if (t.includes("hair") || t.includes("salon") || t.includes("barber") || t.includes("beauty") || t.includes("makeup") || t.includes("nails") || t.includes("spa") || t.includes("massage") || t.includes("facial")) return "💇‍♀️";
  if (t.includes("photo") || t.includes("camera") || t.includes("shoot") || t.includes("portrait") || t.includes("video") || t.includes("film")) return "📷";
  if (t.includes("tutor") || t.includes("math") || t.includes("science") || t.includes("english") || t.includes("teacher") || t.includes("lessons")) return "🧑‍🏫";
  if (t.includes("consult") || t.includes("therapy") || t.includes("counsel") || t.includes("advice") || t.includes("coach")) return "🗣️";
  if (t.includes("move") || t.includes("moving") || t.includes("delivery") || t.includes("shipping") || t.includes("transport") || t.includes("freight")) return "🚚";
  if (t.includes("pet") || t.includes("dog") || t.includes("cat") || t.includes("vet") || t.includes("grooming")) return "🐾";
  if (t.includes("garden") || t.includes("landscaping") || t.includes("lawn") || t.includes("mow") || t.includes("yard") || t.includes("tree")) return "🌿";
  if (t.includes("chef") || t.includes("catering") || t.includes("bake") || t.includes("baking") || t.includes("pastry")) return "👨‍🍳";
  if (t.includes("fitness") || t.includes("personal trainer") || t.includes("workout") || t.includes("gym")) return "💪";
  if (t.includes("doctor") || t.includes("nurse") || t.includes("clinic") || t.includes("health") || t.includes("dental") || t.includes("dentist") || t.includes("medical")) return "⚕️";
  if (t.includes("real estate") || t.includes("realtor") || t.includes("agent") || t.includes("apartment") || t.includes("house") || t.includes("property")) return "🏠";
  if (t.includes("lawyer") || t.includes("legal") || t.includes("attorney") || t.includes("law ")) return "⚖️";

  return defaultEmoji;
}
