// app/api/events/delete-event/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { z } from "zod";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const DeleteSchema = z.object({
  // ✅ accept either _id or eventId (back-compat)
  _id: z.string().optional().default(""),
  eventId: z.string().optional().default(""),

  // ✅ allow old field name too
  creatorClerkId: z.string().optional().default(""),
  clerkUserId: z.string().optional().default(""),
}).superRefine((p, ctx) => {
  const id = (p._id || p.eventId || "").trim();
  if (!id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["_id"], message: "_id (or eventId) is required" });
  }
  const creator = (p.creatorClerkId || p.clerkUserId || "").trim();
  if (!creator) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["creatorClerkId"], message: "creatorClerkId is required" });
  }
});

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json();
    const parsed = DeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const idStr = (parsed.data._id || parsed.data.eventId).trim();
    const creatorClerkId = (parsed.data.creatorClerkId || parsed.data.clerkUserId).trim();

    const objId = ObjectId.isValid(idStr) ? new ObjectId(idStr) : null;
    if (!objId) return NextResponse.json({ error: "Invalid _id" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || "myApp");

    // ✅ only creator can delete
    const res = await db.collection("events").deleteOne({ _id: objId, creatorClerkId });

    if (res.deletedCount === 0) {
      return NextResponse.json({ error: "Event not found or not authorized" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deletedId: idStr });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}
