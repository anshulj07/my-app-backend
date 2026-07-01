// app/api/events/_schemas.ts
import { z } from "zod";

export function normKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

export const LocationSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),

  formattedAddress: z.string().max(300).optional().default(""),
  placeId: z.string().max(200).optional(),

  countryCode: z.string().min(2).max(2),
  countryName: z.string().max(80).optional().default(""),

  admin1: z.string().max(120).optional().default(""),
  admin1Code: z.string().max(10).optional().default(""),

  city: z.string().min(1).max(120),
  cityKey: z.string().max(140).optional(),

  postalCode: z.string().max(20).optional().default(""),
  neighborhood: z.string().max(120).optional().default(""),

  source: z.enum(["user_typed", "places_autocomplete", "reverse_geocode"]).optional().default("user_typed"),
});

export const EventCreateSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().max(2000).optional().default(""),
    emoji: z.string().optional().default("📍"),

    // creator (frontend sends creatorClerkId, keep clerkUserId for backward compat)
    creatorClerkId: z.string().optional().default(""),
    clerkUserId: z.string().optional().default(""),

    kind: z.enum(["free", "paid"]).optional().default("free"),
    isRecurring: z.boolean().optional().default(false),
    priceCents: z.number().int().nullable().optional().default(null),

    // ✅ Who can join: open = direct join, approval = host must approve
    joinPolicy: z.enum(["open", "approval"]).optional().default("open"),

    // ✅ attendance limit (null => open/unlimited). Only allowed for FREE.
    attendance: z.number().int().positive().nullable().optional().default(null),
    // ✅ Also accept "capacity" as alias (frontend uses this field name)
    capacity: z.number().int().positive().nullable().optional().default(null),

    // who joined (array of clerk user ids)
    // ✅ for create-event, default empty; do NOT allow client to set it
    // We'll force it to [] in route anyway.
    attendees: z.array(z.string().min(1)).optional().default([]),

    // ✅ which days of the week the recurring event happens on (0=Sun, 1=Mon... 6=Sat)
    recurringDays: z.array(z.number().int().min(0).max(6)).optional().default([]),

    // ✅ Detailed recurring schedule (day-specific times)
    recurringSchedule: z.array(z.object({
      day: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })).optional().default([]),

    // ✅ Recurring specifics
    bookingWindowDays: z.number().int().min(0).optional().default(1),
    dailyCapacity: z.number().int().positive().nullable().optional().default(null),

    // Preferred: ISO datetime
    startsAt: z.string().datetime().optional(),

    // Backward compatible (optional)
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")).default(""),

    // ✅ End Date & Time
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")).default(""),

    timezone: z.string().max(60).optional().default(""),
    location: LocationSchema,

    tags: z.array(z.string().max(40)).optional().default([]),
    visibility: z.enum(["public", "private"]).optional().default("public"),
    bannerUri: z.string().url().optional().or(z.literal("")).default(""),
  })
  .superRefine((p, ctx) => {
    const creator = (p.creatorClerkId || p.clerkUserId || "").trim();
    if (!creator) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["creatorClerkId"], message: "creatorClerkId is required" });
    }

    // ✅ Merge capacity into attendance if attendance is not set (frontend sends "capacity")
    const effectiveAttendance = p.attendance ?? p.capacity ?? null;

    // paid requires price; free requires null
    if (p.kind === "paid") {
      if (p.priceCents == null || p.priceCents <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceCents"],
          message: "priceCents must be > 0 for paid",
        });
      }

      // ✅ attendance must NOT be set for paid
      if (effectiveAttendance !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attendance"],
          message: "attendance must be null for paid",
        });
      }
    } else {
      if (p.priceCents !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceCents"],
          message: "priceCents must be null for free events",
        });
      }
      // ✅ free can be open (null) or limited (>0). Zod already ensures >0 if number.
    }
  });

export type EventCreateInput = z.infer<typeof EventCreateSchema>;

export function buildStartsAt(payload: EventCreateInput) {
  if (payload.startsAt) return new Date(payload.startsAt);

  // Fallback to construction from date/time strings
  if (payload.date && payload.time) {
    const d = new Date(`${payload.date}T${payload.time}:00`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export function buildEndsAt(payload: any) {
  if (payload.endsAt) return new Date(payload.endsAt);
  if (payload.endDate && payload.endTime) {
    const d = new Date(`${payload.endDate}T${payload.endTime}:00`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}
