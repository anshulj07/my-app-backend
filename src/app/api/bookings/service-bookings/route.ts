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
    const creatorClerkId = (searchParams.get("creatorClerkId") || "").trim();

    if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    if (!creatorClerkId) return NextResponse.json({ error: "creatorClerkId is required" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (String(ev.creatorClerkId || "") !== creatorClerkId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (String(ev.kind || "") !== "service") {
      return NextResponse.json({ error: "Not a service event" }, { status: 400 });
    }

    // bookings schema assumed:
    // { eventId: string, whenISO: string, customerName, customerEmail, customerClerkId, notes }
    const bookings = await db
      .collection("bookings")
      .find({ eventId: eventId })
      .sort({ whenISO: 1 })
      .limit(2000)
      .toArray();

    return NextResponse.json({
      ok: true,
      bookings: bookings.map((b: any) => ({
        _id: b._id.toString(),
        whenISO: b.whenISO || "",
        customerClerkId: b.customerClerkId || "",
        customerName: b.customerName || "",
        customerEmail: b.customerEmail || "",
        notes: b.notes || "",
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
