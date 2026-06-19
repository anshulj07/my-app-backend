// app/api/payment/create-order/route.ts
// POST /api/payment/create-order
// Body: { amount: number (in paise), eventId: string, clerkUserId: string, receipt?: string }

import { NextResponse } from "next/server";
import Razorpay from "razorpay";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { amount, eventId, clerkUserId, receipt } = body;

    if (!amount || typeof amount !== "number" || amount < 100) {
      return NextResponse.json(
        { error: "amount must be a number in paise (min ₹1 = 100 paise)" },
        { status: 400 }
      );
    }
    if (!eventId || !clerkUserId) {
      return NextResponse.json({ error: "eventId and clerkUserId are required" }, { status: 400 });
    }

    const KEY_ID     = process.env.RAZORPAY_KEY_ID;
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!KEY_ID || !KEY_SECRET) {
      console.error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in env");
      return NextResponse.json({ error: "Payment not configured" }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

    const order = await razorpay.orders.create({
      amount,                                              // paise mein (e.g. 19900 = ₹199)
      currency: "INR",
      receipt: receipt || `evt_${eventId.slice(-8)}_${clerkUserId.slice(-6)}_${Date.now().toString().slice(-8)}`,
      notes: {
        eventId,
        clerkUserId,
      },
    });

    return NextResponse.json({
      ok: true,
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    KEY_ID,           // frontend ko chahiye Razorpay SDK ke liye
    });
  } catch (e: any) {
    console.error("[POST /api/payment/create-order]", e);
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}