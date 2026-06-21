// app/api/bookings/service-bookings/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
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
    const eventId = (searchParams.get("eventId") || "").trim();
    const date = (searchParams.get("date") || "").trim();

    if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");

    let ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    if (!ev) {
      ev = await db.collection("services").findOne({ _id: new ObjectId(eventId) });
    }
    
    if (!ev) return NextResponse.json({ error: "Event/Service not found" }, { status: 404 });

    const query: any = { 
      eventId: eventId,
      status: { $in: ["confirmed", "payment_pending", "paid_pending_approval"] } 
    };
    if (date) query.startDate = date;

    const bookings = await db
      .collection("bookings")
      .find(query)
      .project({ startTime: 1, duration: 1, startDate: 1, endDate: 1 })
      .toArray();

    return NextResponse.json({
      ok: true,
      bookings: bookings.map((b: any) => ({
        _id: b._id.toString(),
        startTime: b.startTime || "",
        duration: b.duration || 1,
        startDate: b.startDate || "",
        endDate: b.endDate || ""
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
