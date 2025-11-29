import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";

const PatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  emoji: z.string().optional(),
  address: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
});

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function toObjectId(id: string) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// ✅ NOTE: context.params can be a Promise in newer Next versions
type Ctx = { params: Promise<{ id: string }> | { id: string } };
async function getId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return resolved?.id as string | undefined;
}

export async function GET(req: Request, context: Ctx) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const id = await getId(context);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "myApp");

  const doc = await db.collection("events").findOne({ _id });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, event: { ...doc, _id: doc._id.toString() } });
}

export async function PATCH(req: Request, context: Ctx) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const id = await getId(context);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "myApp");

  const res = await db.collection("events").findOneAndUpdate(
    { _id },
    { $set: { ...parsed.data, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!res?.value) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, event: { ...res.value, _id: res.value._id.toString() } });
}

export async function DELETE(req: Request, context: Ctx) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const id = await getId(context);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "myApp");

  const res = await db.collection("events").deleteOne({ _id });
  if (res.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
