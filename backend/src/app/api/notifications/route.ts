// app/api/notifications/route.ts
// Moderation notifications — event approved/rejected popup ke liye
// events/notifications se ALAG hai — wo host activity feed ke liye hai
//D:\mYapp1\backend\src\app\api\notifications\route.ts

import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — host ke liye unread moderation notifications fetch karo
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clerkUserId = searchParams.get("clerkUserId")?.trim();

  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "clerkUserId required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db("assis_auth");

    const notifications = await db
      .collection("notifications")
      .find({ recipientClerkId: clerkUserId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return NextResponse.json({
      ok: true,
      notifications: notifications.map((n: any) => ({
        ...n,
        _id: n._id.toString(),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// PATCH — notification read mark karo (popup close hone pe)
export async function PATCH(req: Request) {
  try {
    const { clerkUserId, notificationId } = await req.json();

    if (!clerkUserId || !notificationId) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");

    await db.collection("notifications").updateOne(
      { _id: new ObjectId(notificationId), recipientClerkId: clerkUserId },
      { $set: { read: true } }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}