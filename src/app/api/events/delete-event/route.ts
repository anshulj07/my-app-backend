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

    // ✅ Multi-collection search removed
    const oid = new ObjectId(finalEventId);
    const col = db.collection("events");
    const ev = await col.findOne({ _id: oid });

    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // Only creator can delete
    if (String((ev as any).creatorClerkId) !== finalCreatorId) {
      return NextResponse.json(
        { error: "Only the creator can delete this event" },
        { status: 403 }
      );
    }

    // ── MASS REFUND LOGIC ───────────────────────────────────────────────────
    const KEY_ID = process.env.RAZORPAY_KEY_ID;
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    
    if (KEY_ID && KEY_SECRET) {
      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      const pending   = Array.isArray(ev.pendingRequests) ? ev.pendingRequests : [];
      
      // Combine all paid participants
      const paidParticipants = [
        ...attendees.filter((a: any) => a.isPaid && a.bookingId),
        ...pending.filter((p: any) => p.paid && p.bookingId)
      ];

      if (paidParticipants.length > 0) {
        const Razorpay = require("razorpay");
        const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
        
        console.log(`[MassRefund] Event ${finalEventId} deleted. Refunding ${paidParticipants.length} users...`);

        // Process refunds in parallel (non-blocking for this route's response if possible, 
        // but since we await db updates, we'll wait)
        await Promise.all(paidParticipants.map(async (p: any) => {
          const bookingId = p.bookingId;
          const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
          
          if (booking && booking.razorpayPaymentId && !["refunded", "cancelled_refunded"].includes(booking.status)) {
            try {
              const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
                notes: { reason: "Host deleted the event", eventId: finalEventId, bookingId }
              });
              
              await db.collection("bookings").updateOne(
                { _id: new ObjectId(bookingId) },
                { 
                  $set: { 
                    status: "event_deleted_refunded", 
                    razorpayRefundId: refund.id,
                    refundedAt: new Date(),
                    updatedAt: new Date()
                  } 
                }
              );
            } catch (err: any) {
              console.error(`[MassRefund Error] Booking ${bookingId}:`, err.message);
              await db.collection("bookings").updateOne(
                { _id: new ObjectId(bookingId) },
                { $set: { status: "event_deleted_refund_failed", refundError: err.message, updatedAt: new Date() } }
              );
            }
          }
        }));
      }
    }

    // ── Delete event ─────────────────────────────────────────────────────────
    await col.deleteOne({ _id: oid });

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