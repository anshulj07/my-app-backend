// lib/aggregator/types.ts
// Unified schema for events aggregated from external platforms.

export type EventCategory =
  | "walking"
  | "running"
  | "pickleball"
  | "hiking"
  | "fitness"
  | "networking"
  | "social"
  | "sports"
  | "other";

export type AggregatedEvent = {
  source: "eventbrite" | "meetup" | "luma" | "manual";
  sourceId: string;   // platform-native ID — unique per source
  sourceUrl: string;

  title: string;
  description: string;
  emoji: string;
  category: EventCategory;
  tags: string[];

  kind: "free" | "paid";
  priceCents: number;

  startsAt: Date;
  endsAt: Date | null;

  location: {
    lat: number;
    lng: number;
    address: string;
    formattedAddress: string;
    city: string;
    state: string;
    country: string;
    countryCode: string;
    geo: { type: "Point"; coordinates: [number, number] }; // [lng, lat] — GeoJSON
  };

  organizer: {
    name: string;
    url: string;
  };

  attendance: number;       // current RSVPs / going count
  bannerImage: string;

  status: "active" | "cancelled";
  visibility: "public";

  fetchedAt: Date;
  expiresAt: Date;          // TTL index auto-removes ended events
};
