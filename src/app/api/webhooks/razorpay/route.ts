import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !secret) {
      console.warn("[Razorpay Webhook] Missing signature or secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Verify Signature ──────────────────────────────────────────────────────
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("[Razorpay Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const data = JSON.parse(body);
    const event = data.event;

    console.log(`[Razorpay Webhook] Received event: ${event}`);

    // ── Handle order.paid ─────────────────────────────────────────────────────
    if (event === "order.paid") {
      const order = data.payload.order.entity;
      const bookingId = order.notes?.bookingId;

      if (!bookingId || !/^[a-fA-F0-9]{24}$/.test(bookingId)) {
        console.warn("[Razorpay Webhook] No valid bookingId in order notes");
        return NextResponse.json({ ok: true }); // Still return 200 to Razorpay
      }

      const client = await clientPromise;
      const db = client.db("assis_auth");

      const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
      
      if (!booking) {
        console.warn(`[Razorpay Webhook] Booking ${bookingId} not found`);
        return NextResponse.json({ ok: true });
      }

      if (booking.status === "confirmed") {
        console.log(`[Razorpay Webhook] Booking ${bookingId} already confirmed`);
        return NextResponse.json({ ok: true });
      }

      // Generate OTP for check-in
      const otp = String(Math.floor(100000 + Math.random() * 900000));

      // ── Confirm booking ─────────────────────────────────────────────────────
      await db.collection("bookings").updateOne(
        { _id: new ObjectId(bookingId) },
        {
          $set: {
            status: "confirmed",
            razorpayOrderId: order.id,
            checkInOtp: otp,
            confirmedAt: new Date(),
            updatedAt: new Date(),
            webhookProcessed: true,
          },
        }
      );

      console.log(`[Razorpay Webhook] Booking ${bookingId} confirmed via webhook`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[Razorpay Webhook Error]", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
