// // app/api/events/delete-event/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";
// import { z } from "zod";
// import { ObjectId } from "mongodb";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// const DeleteSchema = z.object({
//   // ✅ accept either _id or eventId (back-compat)
//   _id: z.string().optional().default(""),
//   eventId: z.string().optional().default(""),

//   // ✅ allow old field name too
//   creatorClerkId: z.string().optional().default(""),
//   clerkUserId: z.string().optional().default(""),
// }).superRefine((p, ctx) => {
//   const id = (p._id || p.eventId || "").trim();
//   if (!id) {
//     ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["_id"], message: "_id (or eventId) is required" });
//   }
//   const creator = (p.creatorClerkId || p.clerkUserId || "").trim();
//   if (!creator) {
//     ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["creatorClerkId"], message: "creatorClerkId is required" });
//   }
// });

// export async function POST(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const body = await req.json();
//     const parsed = DeleteSchema.safeParse(body);

//     if (!parsed.success) {
//       return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
//     }

//     const idStr = (parsed.data._id || parsed.data.eventId).trim();
//     const creatorClerkId = (parsed.data.creatorClerkId || parsed.data.clerkUserId).trim();

//     const objId = ObjectId.isValid(idStr) ? new ObjectId(idStr) : null;
//     if (!objId) return NextResponse.json({ error: "Invalid _id" }, { status: 400 });

//     const client = await clientPromise;
//     const db = client.db("assis_auth");

//     // ✅ only creator can delete
//     const res = await db.collection("events").deleteOne({ _id: objId, creatorClerkId });

//     if (res.deletedCount === 0) {
//       return NextResponse.json({ error: "Event not found or not authorized" }, { status: 404 });
//     }

//     return NextResponse.json({ ok: true, deletedId: idStr });
//   } catch (e: any) {
//     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
//   }
// }









// app/api/events/delete-event/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const Schema = z.object({
  eventId: z.string().min(1),
  creatorClerkId: z.string().min(1),
});

export async function DELETE(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const { eventId, creatorClerkId } = parsed.data;

    if (!/^[a-fA-F0-9]{24}$/.test(eventId))
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const ev = await db.collection("events").findOne({ _id: new ObjectId(eventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Only creator can delete
    if (String((ev as any).creatorClerkId) !== creatorClerkId)
      return NextResponse.json({ error: "Only the creator can delete this event" }, { status: 403 });

    await db.collection("events").deleteOne({ _id: new ObjectId(eventId) });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
} 