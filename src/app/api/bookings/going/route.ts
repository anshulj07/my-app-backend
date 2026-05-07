// // // app/api/bookings/going/route.ts
// // import { NextResponse } from "next/server";
// // import clientPromise from "../../../../../lib/mongodb";

// // function requireApiKey(req: Request) {
// //   const expected = process.env.EVENT_API_KEY;
// //   if (!expected) return null;
// //   const got = req.headers.get("x-api-key");
// //   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// // }

// // export async function GET(req: Request) {
// //   const auth = requireApiKey(req);
// //   if (auth) return auth;

// //   const reqId = Math.random().toString(36).slice(2, 8);

// //   try {
// //     const { searchParams } = new URL(req.url);
// //     const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
// //     const limitRaw = (searchParams.get("limit") || "200").trim();
// //     const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 200, 1), 1000);

// //     console.log(`[going:${reqId}] clerkUserId=`, clerkUserId, "limit=", limit);

// //     if (!clerkUserId) {
// //       return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
// //     }

// //     const client = await clientPromise;
// //     const db = client.db(process.env.MONGODB_DB || "myApp");

// //     // ✅ Correct query for attendees stored as objects
// //     const query = { "attendees.clerkId": clerkUserId };
// //     console.log(`[going:${reqId}] query=`, query);

// //     const events = await db
// //       .collection("events")
// //       .find(query, {
// //         projection: {
// //           title: 1,
// //           emoji: 1,
// //           description: 1,
// //           creatorClerkId: 1,
// //           kind: 1,
// //           priceCents: 1,
// //           startsAt: 1,
// //           date: 1,
// //           time: 1,
// //           status: 1,
// //           attendance: 1,
// //           attendees: 1,
// //           location: 1,
// //         },
// //       })
// //       .sort({ startsAt: 1, date: 1, time: 1 })
// //       .limit(limit)
// //       .toArray();

// //     console.log(`[going:${reqId}] matchedCount=`, events.length);

// //     return NextResponse.json({ ok: true, goingEvents: events });
// //   } catch (e: any) {
// //     console.error(`[going] error=`, e);
// //     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
// //   }
// // }








// // app/api/bookings/going/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// export async function GET(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const { searchParams } = new URL(req.url);
//     const clerkUserId = String(searchParams.get("clerkUserId") || "");

//     if (!clerkUserId) {
//       return NextResponse.json({ error: "Missing clerkUserId" }, { status: 400 });
//     }

//     const client = await clientPromise;
//     // ✅ FIXED: assis_auth
//     const db = client.db("assis_auth");

//     const docs = await db.collection("events")
//       .find({ "attendees.clerkId": clerkUserId })
//       .sort({ startsAt: 1, createdAt: -1 })
//       .toArray();

//     const events = docs.map((e: any) => {
//       // ✅ Find this user's attendee entry to get their OTP
//       const myEntry = Array.isArray(e.attendees)
//         ? e.attendees.find((a: any) => String(a.clerkId) === String(clerkUserId))
//         : null;

//       return {
//         ...e,
//         _id: e._id.toString(),
//         lat: e.location?.lat ?? null,
//         lng: e.location?.lng ?? null,
//         myCheckInOtp: myEntry?.checkInOtp || null,   // ✅ user's OTP for GoingTab
//         myCheckedIn: myEntry?.checkedIn ?? false,
//         // Strip other attendees' private OTPs
//         attendees: Array.isArray(e.attendees)
//           ? e.attendees.map((a: any) => ({
//               clerkId: a.clerkId,
//               name: a.name || "",
//               imageUrl: a.imageUrl || "",
//               checkedIn: a.checkedIn ?? false,
//             }))
//           : [],
//       };
//     });

//     return NextResponse.json({ ok: true, events });
//   } catch (e: any) {
//     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
//   }
// }










// app/api/bookings/going/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

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
    const clerkUserId = String(searchParams.get("clerkUserId") || "");

    if (!clerkUserId) {
      return NextResponse.json({ error: "Missing clerkUserId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // ✅ Step 1: Get ALL relevant bookings for this user to determine status
    const allBookings = await db.collection("bookings")
      .find({ bookerId: clerkUserId, type: { $in: ["event", "service"] } })
      .toArray();

    // ✅ Step 2: Get events where user is a confirmed attendee (in events collection)
    const joinedDocs = await db.collection("events")
      .find({ "attendees.clerkId": clerkUserId })
      .sort({ startsAt: 1, createdAt: -1 })
      .toArray();

    // ✅ Step 3: Find other events/services where user has a non-pending booking
    const relevantBookingIds = allBookings
      .filter(b => ["confirmed", "paid_pending_approval", "pending_approval"].includes(b.status))
      .map(b => b.eventId)
      .filter(Boolean);
    
    let extraJoinedDocs: any[] = [];
    if (relevantBookingIds.length > 0) {
      const alreadyFoundIds = new Set(joinedDocs.map(d => d._id.toString()));
      const missingIds = relevantBookingIds
        .filter(id => !alreadyFoundIds.has(String(id)))
        .map(id => { try { return new ObjectId(String(id)); } catch { return null; } })
        .filter(Boolean);
      
      if (missingIds.length > 0) {
        const [extraEvents, extraServices] = await Promise.all([
          db.collection("events").find({ _id: { $in: missingIds } } as any).toArray(),
          db.collection("services").find({ _id: { $in: missingIds } } as any).toArray(),
        ]);
        extraJoinedDocs = [...extraEvents, ...extraServices];
      }
    }

    // Combine all "joined" or "in-progress" documents
    const allJoinedDocs = [...joinedDocs, ...extraJoinedDocs];
    const joinedIds = new Set();
    
    const joinedEvents = allJoinedDocs.map((e: any) => {
      joinedIds.add(e._id.toString());
      
      const myEntry = Array.isArray(e.attendees)
        ? e.attendees.find((a: any) => String(a.clerkId) === String(clerkUserId))
        : null;

      const myBooking = allBookings.find(b => String(b.eventId) === e._id.toString());

      // Status logic: use booking status if available, fallback to confirmed if in attendees
      const status = myBooking?.status || (myEntry ? "confirmed" : "pending_approval");

      return {
        ...e,
        _id: e._id.toString(),
        myCheckInOtp: myEntry?.checkInOtp || myBooking?.checkInOtp || null,
        myCheckedIn: !!myEntry?.checkedIn,
        myJoinStatus: status,
        isPaid: !!myBooking?.razorpayPaymentId || !!myEntry?.razorpayPaymentId,
        attendees: Array.isArray(e.attendees)
          ? e.attendees.map((a: any) => ({
              clerkId: a.clerkId,
              name: a.name || "",
              imageUrl: a.imageUrl || "",
              checkedIn: a.checkedIn ?? false,
            }))
          : [],
        pendingRequests: undefined, 
      };
    });

    // ✅ Step 4: Handle legacy pending requests (ensure they aren't unpaid)
    const pendingDocs = await db.collection("events")
      .find({ "pendingRequests.clerkUserId": clerkUserId })
      .sort({ startsAt: 1, createdAt: -1 })
      .toArray();

    const pendingEvents = pendingDocs
      .filter((e: any) => !joinedIds.has(e._id.toString()))
      .filter((e: any) => {
        // ONLY include if there's NO payment_pending booking for this event
        const myBooking = allBookings.find(b => String(b.eventId) === e._id.toString());
        return !myBooking || myBooking.status !== "payment_pending";
      })
      .map((e: any) => ({
        ...e,
        _id: e._id.toString(),
        myCheckInOtp: null,
        myCheckedIn: false,
        myJoinStatus: "pending_approval", 
        attendees: [],
        pendingRequests: undefined,
      }));

    const events = [...joinedEvents, ...pendingEvents];

    return NextResponse.json({ ok: true, events });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
  }
}