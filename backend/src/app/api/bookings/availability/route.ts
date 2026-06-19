// app/api/bookings/availability/route.ts
// GET /api/bookings/availability?hostId=X&month=2025-06
// Returns all booked date ranges for a host in a given month

import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const hostId = (searchParams.get("hostId") || "").trim();
    const month = (searchParams.get("month") || "").trim(); // "YYYY-MM"

    if (!hostId) {
      return NextResponse.json({ error: "hostId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // Build date range for the month
    let dateFilter: any = {};
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, mon] = month.split("-").map(Number);
      const monthStart = `${year}-${String(mon).padStart(2, "0")}-01`;
      const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
      dateFilter = {
        $or: [
          // Booking starts in this month
          { startDate: { $gte: monthStart, $lt: nextMonth } },
          // Booking ends in this month
          { endDate: { $gte: monthStart, $lt: nextMonth } },
          // Booking spans entire month
          { startDate: { $lt: monthStart }, endDate: { $gte: nextMonth } },
        ],
      };
    }

    const bookings = await db.collection("bookings").find(
      {
        hostId,
        status: { $in: ["confirmed", "payment_pending"] },
        ...dateFilter,
      },
      {
        projection: {
          startDate: 1,
          endDate: 1,
          status: 1,
          days: 1,
          type: 1,
          booker: 1,
        },
      }
    ).toArray();

    // Build list of all booked dates
    const bookedDates: string[] = [];
    const bookedRanges: { start: string; end: string; status: string }[] = [];

    bookings.forEach((b: any) => {
      bookedRanges.push({
        start: b.startDate,
        end: b.endDate,
        status: b.status,
      });

      // Expand range into individual dates
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      const current = new Date(start);
      while (current <= end) {
        bookedDates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
    });

    return NextResponse.json({
      ok: true,
      hostId,
      bookedDates: [...new Set(bookedDates)].sort(),
      bookedRanges,
      totalBookings: bookings.length,
    });

  } catch (e: any) {
    console.error("[GET /api/bookings/availability]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}