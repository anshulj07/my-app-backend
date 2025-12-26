import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => ({}));

    const idRaw = String(body?._id || body?.eventId || "").trim();
    const actorClerkId = String(body?.creatorClerkId || "").trim(); // better name
    const enabled = body?.enabled;

    if (!idRaw) return NextResponse.json({ error: "Missing _id/eventId" }, { status: 400 });
    if (!actorClerkId) return NextResponse.json({ error: "Missing creatorClerkId" }, { status: 400 });
    if (typeof enabled !== "boolean") return NextResponse.json({ error: "Missing enabled:boolean" }, { status: 400 });

    if (!ObjectId.isValid(idRaw)) return NextResponse.json({ error: "Invalid ObjectId" }, { status: 400 });
    const _id = new ObjectId(idRaw);

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");
    const col = db.collection("events");

    const ev = await col.findOne({ _id });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    if (String(ev.creatorClerkId) !== actorClerkId) {
      return NextResponse.json({ error: "Forbidden: not creator" }, { status: 403 });
    }

    if (String(ev.kind) !== "service") {
      return NextResponse.json({ error: "Only service listings can be toggled" }, { status: 400 });
    }

    const nextStatus = enabled ? "active" : "paused";

    const upd = await col.findOneAndUpdate(
      { _id },
      { $set: { status: nextStatus, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    return NextResponse.json({
      ok: true,
      status: upd?.value?.status,
      event: { ...upd?.value, _id: upd?.value?._id?.toString() },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}

