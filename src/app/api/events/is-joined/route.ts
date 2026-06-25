// // app/api/events/is-joined/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";
// import { ObjectId } from "mongodb";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// function isValidObjectId(id: string) {
//   return /^[a-fA-F0-9]{24}$/.test(id);
// }

// export async function GET(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const { searchParams } = new URL(req.url);
//     const eventId = String(searchParams.get("eventId") || "");
//     const clerkUserId = String(searchParams.get("clerkUserId") || "");

//     if (!eventId || !clerkUserId) {
//       return NextResponse.json({ error: "Missing eventId or clerkUserId" }, { status: 400 });
//     }

//     if (!isValidObjectId(eventId)) {
//       return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
//     }

//     const client = await clientPromise;
//     const db = client.db("assis_auth");

//     // Efficient: just check if an attendee entry exists
//     const ev = await db.collection("events").findOne(
//       { _id: new ObjectId(eventId), "attendees.clerkId": clerkUserId },
//       { projection: { _id: 1 } }
//     );

//     return NextResponse.json({ ok: true, joined: !!ev }, { status: 200 });
//   } catch (e: any) {
//     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
//   }
// }







// app/api/events/is-joined/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isValidObjectId(id: string) {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const eventId = String(searchParams.get("eventId") || "");
    const clerkUserId = String(searchParams.get("clerkUserId") || "");

    if (!eventId || !clerkUserId) {
      return NextResponse.json({ error: "Missing eventId or clerkUserId" }, { status: 400 });
    }
    if (!isValidObjectId(eventId)) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    let ev = await db.collection("events").findOne(
      { _id: new ObjectId(eventId) },
      { projection: { "attendees": 1, "pendingRequests": 1 } }
    );



    if (!ev) return NextResponse.json({ ok: true, joined: false, pending: false }, { status: 200 });

    // Check attendees
    const attendee = ((ev as any).attendees || []).find(
      (a: any) => String(a.clerkId || "") === clerkUserId
    );

    if (attendee) {
      return NextResponse.json({
        ok: true,
        joined: true,
        pending: false,
        checkInOtp: attendee.checkInOtp || "",
        checkedIn: attendee.checkedIn ?? false,
      }, { status: 200 });
    }

    // ✅ Fallback: check bookings collection (incase sync failed or legacy data)
    const confirmedBooking = await db.collection("bookings").findOne({
      bookerId: clerkUserId,
      eventId: eventId,
      status: "confirmed"
    });

    if (confirmedBooking) {
      return NextResponse.json({
        ok: true,
        joined: true,
        pending: false,
        checkInOtp: confirmedBooking.checkInOtp || "",
        checkedIn: false,
      }, { status: 200 });
    }

    // Check pendingRequests (approval events)
    const isPendingInEvent = ((ev as any).pendingRequests || []).some(
      (p: any) => String(p.clerkUserId || "") === clerkUserId
    );

    let isPending = isPendingInEvent;

    // ✅ NEW: Verify if there's a payment_pending booking. 
    // If so, we are NOT 'pending' in terms of approval flow (we are unpaid).
    // BUT if it's 'paid_pending_approval', we ARE pending approval.
    const unpaidBooking = await db.collection("bookings").findOne({
      bookerId: clerkUserId,
      eventId: eventId,
      status: { $in: ["payment_pending", "paid_pending_approval"] }
    });

    if (unpaidBooking) {
      if (unpaidBooking.status === "payment_pending") {
        isPending = false; // They haven't paid yet, so they shouldn't show as 'Waiting for Approval'
      } else if (unpaidBooking.status === "paid_pending_approval") {
        isPending = true; // They paid, waiting for host to approve
      }
    }

    return NextResponse.json({
      ok: true,
      joined: false,
      pending: isPending,
    }, { status: 200 });

  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}