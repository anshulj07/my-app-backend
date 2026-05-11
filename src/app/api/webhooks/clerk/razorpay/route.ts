// app/api/webhooks/razorpay/route.ts
// Razorpay webhook handler
// Razorpay Dashboard → Webhooks → Add: https://yourdomain.com/api/webhooks/razorpay
// Events to subscribe: payment.captured, payment.failed, order.paid

import { NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "../../../../../../lib/mongodb";

// ✅ Raw body chahiye signature verify ke liye — JSON parse mat karo pehle
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Razorpay Webhook] Missing RAZORPAY_WEBHOOK_SECRET");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    // ✅ Signature verify — Razorpay ka official method
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("[Razorpay Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // ✅ Parse event
    const event = JSON.parse(rawBody);
    const eventType = event?.event;

    console.log("[Razorpay Webhook] Event received:", eventType);

    const client = await clientPromise;
    const db = client.db("assis_auth");

    // ─────────────────────────────────────────────
    // Event: payment.captured
    // User ne payment kar di aur Razorpay ne capture ki
    // ─────────────────────────────────────────────
    if (eventType === "payment.captured") {
      const payment = event?.payload?.payment?.entity;
      const orderId   = payment?.order_id;
      const paymentId = payment?.id;
      const amount    = payment?.amount;   // paise mein

      const eventId      = payment?.notes?.eventId;
      const clerkUserId  = payment?.notes?.clerkUserId;

      console.log("[Razorpay Webhook] payment.captured", { orderId, paymentId, eventId, clerkUserId });

      if (!orderId || !paymentId) {
        return NextResponse.json({ ok: true, ignored: "no orderId/paymentId" });
      }

      // Payment record upsert karo DB mein
      await db.collection("payments").updateOne(
        { razorpayOrderId: orderId },
        {
          $set: {
            razorpayOrderId:   orderId,
            razorpayPaymentId: paymentId,
            amountPaise:       amount ?? 0,
            status:            "verified",
            capturedAt:        new Date(),
            updatedAt:         new Date(),
            ...(eventId     ? { eventId }     : {}),
            ...(clerkUserId ? { clerkUserId } : {}),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      // ✅ Agar notes mein eventId + clerkUserId hain
      // aur user abhi tak join nahi hua — auto-join karo
      if (eventId && clerkUserId) {
        const events = db.collection("events");

        const ev = await events.findOne(
          { _id: (() => { try { const { ObjectId } = require("mongodb"); return new ObjectId(eventId); } catch { return null; } })() },
          { projection: { attendees: 1, attendance: 1, joinPolicy: 1 } }
        );

        if (ev) {
          const alreadyJoined = ((ev as any).attendees || []).some(
            (a: any) => String(a.clerkId) === String(clerkUserId)
          );

          if (!alreadyJoined) {
            const otp = String(Math.floor(100000 + Math.random() * 900000));

            // User details DB se lo
            const userDoc = await db.collection("users").findOne({ clerkUserId });
            const name      = `${userDoc?.profile?.firstName || ""} ${userDoc?.profile?.lastName || ""}`.trim() || userDoc?.clerk?.firstName || "Guest";
            const email     = userDoc?.clerk?.email || "";
            const imageUrl  = userDoc?.profile?.avatar?.url || userDoc?.clerk?.imageUrl || "";

            const { ObjectId } = await import("mongodb");
            await events.updateOne(
              { _id: new ObjectId(eventId) },
              {
                $push: {
                  attendees: {
                    clerkId:     clerkUserId,
                    name,
                    email,
                    imageUrl,
                    joinedAt:    new Date(),
                    checkInOtp:  otp,
                    checkedIn:   false,
                    checkedInAt: null,
                    paymentId,
                    orderId,
                    paidAt:      new Date(),
                    source:      "webhook", // ← webhook se join hua
                  },
                } as any,
                $set: { updatedAt: new Date() },
              }
            );

            // OTP payment record mein bhi save karo
            await db.collection("payments").updateOne(
              { razorpayOrderId: orderId },
              { $set: { checkInOtp: otp, joinedViaWebhook: true } }
            );

            console.log(`[Razorpay Webhook] Auto-joined user ${clerkUserId} to event ${eventId} with OTP ${otp}`);
          }
        }
      }

      return NextResponse.json({ ok: true, received: "payment.captured" });
    }

    // ─────────────────────────────────────────────
    // Event: order.paid
    // Order complete ho gaya (payment.captured ke baad bhi aata hai)
    // ─────────────────────────────────────────────
    if (eventType === "order.paid") {
      const order     = event?.payload?.order?.entity;
      const payment   = event?.payload?.payment?.entity;
      const orderId   = order?.id;
      const paymentId = payment?.id;

      if (orderId) {
        await db.collection("payments").updateOne(
          { razorpayOrderId: orderId },
          {
            $set: {
              status:    "verified",
              orderPaid: true,
              updatedAt: new Date(),
              ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
            },
          }
        );
      }

      return NextResponse.json({ ok: true, received: "order.paid" });
    }

    // ─────────────────────────────────────────────
    // Event: payment.failed
    // Payment fail ho gaya
    // ─────────────────────────────────────────────
    if (eventType === "payment.failed") {
      const payment   = event?.payload?.payment?.entity;
      const orderId   = payment?.order_id;
      const paymentId = payment?.id;
      const errorDesc = payment?.error_description || "Payment failed";

      console.log("[Razorpay Webhook] payment.failed", { orderId, paymentId, errorDesc });

      if (orderId) {
        await db.collection("payments").updateOne(
          { razorpayOrderId: orderId },
          {
            $set: {
              status:      "failed",
              failedAt:    new Date(),
              failReason:  errorDesc,
              updatedAt:   new Date(),
            },
            $setOnInsert: {
              razorpayOrderId: orderId,
              createdAt:       new Date(),
            },
          },
          { upsert: true }
        );
      }

      return NextResponse.json({ ok: true, received: "payment.failed" });
    }

    // Ignore unknown events
    console.log("[Razorpay Webhook] Ignored event:", eventType);
    return NextResponse.json({ ok: true, ignored: eventType });

  } catch (e: any) {
    console.error("[Razorpay Webhook] Error:", e);
    return NextResponse.json(
      { error: "Server error", detail: e?.message ?? "" },
      { status: 500 }
    );
  }
}