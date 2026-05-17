// lib/aggregator/categoryDetect.ts
// Keyword-based category detection. Ordered by specificity (more specific first).

import type { EventCategory } from "./types";

const RULES: Array<{ category: EventCategory; keywords: string[] }> = [
  {
    category: "pickleball",
    keywords: ["pickleball", "pickle ball"],
  },
  {
    category: "running",
    keywords: [
      "running club", "run club", "5k", "10k", "half marathon", "marathon",
      "jog", "jogging", "sprint", "track run", "fun run", "running group",
      "trail run", "road race",
    ],
  },
  {
    category: "hiking",
    keywords: [
      "hiking", "hike", "trail hike", "mountain hike", "summit",
      "backpacking", "trekking", "nature hike", "day hike",
    ],
  },
  {
    category: "walking",
    keywords: [
      "walking group", "walk club", "morning walk", "evening walk",
      "group walk", "community walk", "stroll", "walking tour",
      "urban walk", "nature walk",
    ],
  },
  {
    category: "fitness",
    keywords: [
      "fitness", "workout", "gym", "yoga", "pilates", "crossfit", "cross-fit",
      "strength training", "weightlifting", "aerobics", "zumba", "bootcamp",
      "boot camp", "hiit", "spin class", "cycling class", "calisthenics",
      "stretch", "wellness class", "dance fitness", "kickboxing",
    ],
  },
  {
    category: "sports",
    keywords: [
      "basketball", "soccer", "football", "baseball", "volleyball", "tennis",
      "golf", "softball", "ultimate frisbee", "frisbee", "cricket", "rugby",
      "badminton", "ping pong", "table tennis", "lacrosse", "field hockey",
      "sport league", "rec league", "recreational league",
    ],
  },
  {
    category: "networking",
    keywords: [
      "networking", "professional mixer", "career fair", "startup meetup",
      "entrepreneur", "tech meetup", "industry meetup", "business networking",
      "professional development", "job fair", "founders",
    ],
  },
  {
    category: "social",
    keywords: [
      "social gathering", "community gathering", "meetup", "hangout",
      "happy hour", "potluck", "mixer", "game night", "trivia night",
      "board game", "karaoke", "block party", "community event",
      "social club", "friend group", "singles", "speed friending",
    ],
  },
];

export function detectCategory(
  title: string,
  description?: string,
  tags?: string[]
): EventCategory {
  const text = [title, description ?? "", ...(tags ?? [])]
    .join(" ")
    .toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.category;
    }
  }

  return "other";
}

const CATEGORY_EMOJI: Record<EventCategory, string> = {
  walking:    "🚶",
  running:    "🏃",
  pickleball: "🏓",
  hiking:     "🥾",
  fitness:    "💪",
  networking: "🤝",
  social:     "🎉",
  sports:     "⚽",
  other:      "📍",
};

export function categoryToEmoji(category: EventCategory): string {
  return CATEGORY_EMOJI[category] ?? "📍";
}
