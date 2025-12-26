// app/api/events/attendees/route.ts
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

    const attendees: string[] = Array.isArray(ev.attendees) ? ev.attendees : [];

    // Optional: if you have a users collection with clerkId, enrich it.
    const users = await db
      .collection("users")
      .find({ clerkId: { $in: attendees } }, { projection: { clerkId: 1, name: 1, email: 1, imageUrl: 1 } })
      .toArray()
      .catch(() => []);

    const map = new Map<string, any>();
    for (const u of users as any[]) map.set(String(u.clerkId), u);

    const out = attendees.map((id) => {
      const u = map.get(id);
      return {
        clerkId: id,
        name: u?.name || "",
        email: u?.email || "",
        imageUrl: u?.imageUrl || "",
      };
    });

    return NextResponse.json({ ok: true, attendees: out });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
