import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
