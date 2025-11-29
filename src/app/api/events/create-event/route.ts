import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { z } from "zod";

const EventSchema = z.object({
  title: z.string().min(1).max(120),
  emoji: z.string().optional(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  address: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
});

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json();
    const parsed = EventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    const doc = {
      ...payload,
      emoji: payload.emoji ?? "📍",
      address: payload.address ?? "",
      date: payload.date ?? "",
      time: payload.time ?? "",
      createdAt: new Date(),
    };

    const res = await db.collection("events").insertOne(doc);

    return NextResponse.json(
      { ok: true, id: res.insertedId.toString(), event: { ...doc, _id: res.insertedId.toString() } },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    const events = await db
      .collection("events")
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      ok: true,
      events: events.map((e: any) => ({ ...e, _id: e._id.toString() })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
