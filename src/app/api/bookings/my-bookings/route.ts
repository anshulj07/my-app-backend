// // app/api/bookings/my-bookings/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../../lib/mongodb";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// function requireApiKey(req: Request) {
//   const expected = process.env.EVENT_API_KEY;
//   if (!expected) return null;
//   const got = req.headers.get("x-api-key");
//   return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

// function safeDateFromEvent(e: any): Date | null {
//   if (e?.startsAt) {
//     const d = new Date(e.startsAt);
//     if (Number.isFinite(d.getTime())) return d;
//   }
//   const date = typeof e?.date === "string" ? e.date : "";
//   const time = typeof e?.time === "string" ? e.time : "";
//   if (date && time) {
//     const d = new Date(`${date}T${time}:00Z`);
//     if (Number.isFinite(d.getTime())) return d;
//   }
//   if (date) {
//     const d = new Date(`${date}T12:00:00Z`);
//     if (Number.isFinite(d.getTime())) return d;
//   }
//   return null;
// }

// function normalizeEvent(e: any) {
//   const _id = e?._id?.toString?.() ?? String(e?._id ?? "");
//   const startsAtIso =
//     e?.startsAt && Number.isFinite(new Date(e.startsAt).getTime())
//       ? new Date(e.startsAt).toISOString()
//       : null;
//   return { ...e, _id, startsAt: startsAtIso };
// }

// export async function GET(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const { searchParams } = new URL(req.url);
//     const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
//     if (!clerkUserId) {
//       return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
//     }

//     const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

//     const client = await clientPromise;
//     // ✅ FIXED: was process.env.MONGODB_DB || "myApp"
//     const db = client.db("assis_auth");

//     const createdRaw = await db
//       .collection("events")
//       .find({ creatorClerkId: clerkUserId })
//       .sort({ createdAt: -1 })
//       .limit(limit)
//       .toArray();

//     const createdEvents = createdRaw.map(normalizeEvent);

//     const now = Date.now();
//     const createdUpcoming = createdEvents.filter(
//       (e) => (safeDateFromEvent(e)?.getTime() ?? 9e15) >= now
//     );
//     const createdPast = createdEvents.filter(
//       (e) => (safeDateFromEvent(e)?.getTime() ?? 9e15) < now
//     );

//     return NextResponse.json(
//       {
//         ok: true,
//         createdEvents,
//         createdUpcoming,
//         createdPast,
//         goingEvents: [],  // fetched separately via /api/bookings/going
//         pastEvents: createdPast,
//       },
//       { status: 200 }
//     );
//   } catch (e: any) {
//     return NextResponse.json({ error: "Server error", detail: e?.message ?? "" }, { status: 500 });
//   }
// }









// app/api/bookings/my-bookings/route.ts
// GET  /api/bookings/my-bookings?clerkUserId=X&role=booker|host
// POST /api/bookings/my-bookings (rebook - create new booking from old one)

import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET: Fetch all my bookings + created events ──────────────────────────────
export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
    const role = (searchParams.get("role") || "booker").trim(); // "booker" | "host" | "both"

    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // ─── 1. Fetch events CREATED by this user ─────────────────
    const createdEventsRaw = await db
      .collection("events")
      .find({ creatorClerkId: clerkUserId })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const allCreatedRaw = [...createdEventsRaw]
      .sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 500);

    const createdEvents = allCreatedRaw.map((e: any) => ({
      ...e,
      _id: e._id.toString(),
    }));

    // ─── 2. Fetch bookings (host/booker) ───────────────────────────────────
    let query: any = {};

    if (role === "booker") {
      query = { bookerId: clerkUserId };
    } else if (role === "host") {
      query = { hostId: clerkUserId };
    } else {
      query = { $or: [{ bookerId: clerkUserId }, { hostId: clerkUserId }] };
    }

    const bookings = await db
      .collection("bookings")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    // Enrich with user profile data
    const allUserIds = new Set<string>();
    bookings.forEach((b: any) => {
      if (b.bookerId) allUserIds.add(b.bookerId);
      if (b.hostId) allUserIds.add(b.hostId);
    });

    const users = await db
      .collection("users")
      .find(
        { clerkUserId: { $in: Array.from(allUserIds) } },
        {
          projection: {
            clerkUserId: 1,
            "profile.firstName": 1,
            "profile.lastName": 1,
            "profile.avatar": 1,
            "profile.photos": 1,
            "profile.about": 1,
            "clerk.imageUrl": 1,
          },
        }
      )
      .toArray();

    const userMap = new Map(users.map((u: any) => [u.clerkUserId, u]));

    function getAvatar(u: any): string {
      const av = u?.profile?.avatar;
      if (typeof av === "string" && av) return av;
      if (av?.url) return av.url;
      const photos = u?.profile?.photos;
      if (Array.isArray(photos) && photos.length > 0) {
        const p = photos[0];
        return typeof p === "string" ? p : (p?.url || "");
      }
      return u?.clerk?.imageUrl || "";
    }

    function getName(u: any): string {
      const fn = u?.profile?.firstName || "";
      const ln = u?.profile?.lastName || "";
      return `${fn} ${ln}`.trim() || "User";
    }

    const enriched = bookings.map((b: any) => {
      const bookerUser = userMap.get(b.bookerId);
      const hostUser = userMap.get(b.hostId);

      return {
        ...b,
        _id: b._id.toString(),
        bookerProfile: {
          name: getName(bookerUser),
          avatar: getAvatar(bookerUser),
          about: bookerUser?.profile?.about || "",
        },
        hostProfile: {
          name: getName(hostUser),
          avatar: getAvatar(hostUser),
          about: hostUser?.profile?.about || "",
        },
        amIBooker: b.bookerId === clerkUserId,
        amIHost: b.hostId === clerkUserId,
        canRebook: b.status === "completed" || b.status === "cancelled",
      };
    });

    // Split into upcoming / past / pending
    const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const upcoming = enriched.filter(
      (b) => b.endDate >= now && ["confirmed", "payment_pending"].includes(b.status)
    );
    const past = enriched.filter(
      (b) => b.endDate < now || ["completed", "cancelled"].includes(b.status)
    );
    const pending = enriched.filter((b) => b.status === "payment_pending");

    return NextResponse.json({
      ok: true,
      // ✅ createdEvents — for MyBookingsScreen Created tab
      createdEvents,
      // Legacy booking fields
      all: enriched,
      upcoming,
      past,
      pending,
      counts: {
        total: enriched.length,
        upcoming: upcoming.length,
        past: past.length,
        pending: pending.length,
        created: createdEvents.length,
      },
    });

  } catch (e: any) {
    console.error("[GET /api/bookings/my-bookings]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}

// ── POST: Rebook (create new booking from an old one) ────────────────────────
export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const {
      originalBookingId, // ID of the booking to rebook from
      newStartDate,      // new start date
      newEndDate,        // new end date
      notes,
    } = body;

    if (!originalBookingId || !newStartDate || !newEndDate) {
      return NextResponse.json(
        { error: "originalBookingId, newStartDate, newEndDate required" },
        { status: 400 }
      );
    }

    if (!/^[a-fA-F0-9]{24}$/.test(originalBookingId)) {
      return NextResponse.json({ error: "Invalid originalBookingId" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // Get original booking
    const original = await db.collection("bookings").findOne({
      _id: new ObjectId(originalBookingId),
    });

    if (!original) {
      return NextResponse.json({ error: "Original booking not found" }, { status: 404 });
    }

    // Validate new dates
    const startMs = new Date(newStartDate).getTime();
    const endMs = new Date(newEndDate).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
      return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
    }

    // Check host availability for new dates
    const conflicting = await db.collection("bookings").findOne({
      hostId: original.hostId,
      status: { $in: ["confirmed", "pending"] },
      _id: { $ne: new ObjectId(originalBookingId) },
      startDate: { $lte: newEndDate },
      endDate: { $gte: newStartDate },
    });

    if (conflicting) {
      return NextResponse.json(
        { error: "Host is not available for these dates", available: false },
        { status: 409 }
      );
    }

    // Calculate new price
    const days = Math.max(
      1,
      Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24))
    );
    const totalPrice = original.pricePerDay * days;
    const isPaid = totalPrice > 0;

    // Create new booking
    const newBookingDoc = {
      ...original,
      _id: undefined, // remove old _id
      startDate: newStartDate,
      endDate: newEndDate,
      days,
      totalPrice,
      status: isPaid ? "payment_pending" : "confirmed",
      checkInOtp: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      rebookedFrom: originalBookingId,
      notes: notes || original.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await db.collection("bookings").insertOne(newBookingDoc);
    const newBookingId = insertResult.insertedId.toString();

    // If free, confirm immediately
    if (!isPaid) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await db.collection("bookings").updateOne(
        { _id: insertResult.insertedId },
        { $set: { checkInOtp: otp, status: "confirmed" } }
      );

      return NextResponse.json({
        ok: true,
        bookingId: newBookingId,
        status: "confirmed",
        checkInOtp: otp,
        days,
        totalPrice: 0,
        requiresPayment: false,
        rebookedFrom: originalBookingId,
      });
    }

    // If paid, create Razorpay order
    const KEY_ID = process.env.RAZORPAY_KEY_ID;
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!KEY_ID || !KEY_SECRET) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await db.collection("bookings").updateOne(
        { _id: insertResult.insertedId },
        { $set: { checkInOtp: otp, status: "confirmed" } }
      );
      return NextResponse.json({
        ok: true,
        bookingId: newBookingId,
        status: "confirmed",
        checkInOtp: otp,
        days,
        totalPrice,
        requiresPayment: false,
        rebookedFrom: originalBookingId,
      });
    }

    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
    const order = await razorpay.orders.create({
      amount: totalPrice,
      currency: "INR",
      receipt: `rbk_${newBookingId.slice(-8)}_${Date.now().toString().slice(-6)}`,
      notes: {
        bookingId: newBookingId,
        rebookedFrom: originalBookingId,
        type: "rebook",
      },
    });

    await db.collection("bookings").updateOne(
      { _id: insertResult.insertedId },
      { $set: { razorpayOrderId: order.id, updatedAt: new Date() } }
    );

    return NextResponse.json({
      ok: true,
      bookingId: newBookingId,
      status: "payment_pending",
      requiresPayment: true,
      payment: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: KEY_ID,
      },
      days,
      totalPrice,
      rebookedFrom: originalBookingId,
    });

  } catch (e: any) {
    console.error("[POST /api/bookings/my-bookings rebook]", e);
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}