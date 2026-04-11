// // app/api/events/delete-event/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";
// import { ObjectId } from "mongodb";
// import { z } from "zod";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// const Schema = z.object({
//   eventId: z.string().min(1).optional(),
//   _id: z.string().min(1).optional(),
//   creatorClerkId: z.string().min(1).optional(),
//   clerkUserId: z.string().min(1).optional(),
// }).refine((data) => (data.eventId || data._id) && (data.creatorClerkId || data.clerkUserId), {
//   message: "Either (eventId or _id) and (creatorClerkId or clerkUserId) must be provided",
// });

// async function handleDelete(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const body = await req.json().catch(() => null);
//     const parsed = Schema.safeParse(body);
//     if (!parsed.success) {
//       return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
//     }

//     const { eventId, _id, creatorClerkId, clerkUserId } = parsed.data;
//     const finalEventId = (eventId || _id) as string;
//     const finalCreatorId = (creatorClerkId || clerkUserId) as string;

//     if (!/^[a-fA-F0-9]{24}$/.test(finalEventId)) {
//       return NextResponse.json({ error: "Invalid eventId format" }, { status: 400 });
//     }

//     const client = await clientPromise;
//     const db = client.db("assis_auth");

//     const ev = await db.collection("events").findOne({ _id: new ObjectId(finalEventId) });
//     if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

//     // Only creator can delete
//     if (String((ev as any).creatorClerkId) !== finalCreatorId) {
//       return NextResponse.json({ error: "Only the creator can delete this event" }, { status: 403 });
//     }

//     await db.collection("events").deleteOne({ _id: new ObjectId(finalEventId) });

//     return NextResponse.json({ ok: true });
//   } catch (e: any) {
//     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
//   }
// }

// export async function DELETE(req: Request) {
//   return handleDelete(req);
// }

// export async function POST(req: Request) {
//   return handleDelete(req);
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

const Schema = z
  .object({
    eventId:        z.string().min(1).optional(),
    _id:            z.string().min(1).optional(),
    creatorClerkId: z.string().min(1).optional(),
    clerkUserId:    z.string().min(1).optional(),
  })
  .refine(
    (d) => (d.eventId || d._id) && (d.creatorClerkId || d.clerkUserId),
    { message: "Either (eventId or _id) and (creatorClerkId or clerkUserId) must be provided" }
  );

async function handleDelete(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventId, _id, creatorClerkId, clerkUserId } = parsed.data;
    const finalEventId  = (eventId || _id) as string;
    const finalCreatorId = (creatorClerkId || clerkUserId) as string;

    if (!/^[a-fA-F0-9]{24}$/.test(finalEventId)) {
      return NextResponse.json({ error: "Invalid eventId format" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    const ev = await db.collection("events").findOne({ _id: new ObjectId(finalEventId) });
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Only creator can delete
    if (String((ev as any).creatorClerkId) !== finalCreatorId) {
      return NextResponse.json(
        { error: "Only the creator can delete this event" },
        { status: 403 }
      );
    }

    // ── Delete event ─────────────────────────────────────────────────────────
    await db.collection("events").deleteOne({ _id: new ObjectId(finalEventId) });

    // ── Decrement eventsHosted in user_stats ──────────────────────────────────
    // Use $max to never go below 0
    await db.collection("user_stats").updateOne(
      { clerkUserId: finalCreatorId },
      [
        {
          $set: {
            eventsHosted: {
              $max: [0, { $subtract: [{ $ifNull: ["$eventsHosted", 0] }, 1] }],
            },
            updatedAt: new Date(),
          },
        },
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  return handleDelete(req);
}

export async function POST(req: Request) {
  return handleDelete(req);
}