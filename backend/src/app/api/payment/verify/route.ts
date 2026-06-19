// app/api/payment/verify/route.ts
// POST /api/payment/verify
// Razorpay signature verify karta hai - HMAC SHA256
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, eventId, clerkUserId }

import { NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "../../../../../lib/mongodb";

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

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      eventId,
      clerkUserId,
      amount,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "razorpay_order_id, razorpay_payment_id, razorpay_signature required" },
        { status: 400 }
      );
    }
    if (!eventId || !clerkUserId) {
      return NextResponse.json({ error: "eventId and clerkUserId required" }, { status: 400 });
    }

    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    if (!KEY_SECRET) {
      return NextResponse.json({ error: "Payment not configured" }, { status: 500 });
    }

    // ✅ Razorpay signature verify - official method
    const expectedSignature = crypto
      .createHmac("sha256", KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { ok: false, error: "Payment verification failed. Invalid signature." },
        { status: 400 }
      );
    }

    // ✅ Save payment record in DB (payments collection)
    const client = await clientPromise;
    const db = client.db("assis_auth");

    await db.collection("payments").insertOne({
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      eventId,
      clerkUserId,
      amountPaise:  amount ?? 0,
      status:       "verified",
      verifiedAt:   new Date(),
      createdAt:    new Date(),
    });

    return NextResponse.json({
      ok: true,
      verified: true,
      paymentId: razorpay_payment_id,
      orderId:   razorpay_order_id,
    });
  } catch (e: any) {
    console.error("[POST /api/payment/verify]", e);
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}