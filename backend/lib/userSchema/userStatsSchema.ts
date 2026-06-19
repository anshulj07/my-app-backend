// lib/userSchema/userStatsSchema.ts
export type UserStatsDoc = {
  clerkUserId: string;
  rating: number;       // Average of all reviews
  eventsHosted: number; // Count of events created by user
  totalAttendees: number; // Sum of attendees from all hosted events
  reviewsCount: number; // Number of reviews received
  updatedAt: Date;
};

export const INITIAL_USER_STATS: Omit<UserStatsDoc, "clerkUserId" | "updatedAt"> = {
  rating: 0,
  eventsHosted: 0,
  totalAttendees: 0,
  reviewsCount: 0,
};
