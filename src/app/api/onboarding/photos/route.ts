// app/api/onboarding/photos/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    const API_KEY = process.env.EVENT_API_KEY;

    if (!API_KEY || apiKeyHeader !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const clerkUserId = String(body.clerkUserId || "").trim();
    const photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean) : [];

    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    if (photos.length < 2) {
      return NextResponse.json({ error: "At least 2 photos are required" }, { status: 400 });
    }

    if (photos.length > 6) {
      return NextResponse.json({ error: "Max 6 photos allowed" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const users = db.collection("users");

    const result = await users.updateOne(
      { clerkUserId },
      {
        $set: {
          "profile.photos": photos,
          "onboarding.step": "done",
          "onboarding.completed": true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          clerkUserId,
          createdAt: new Date(),
          deletedAt: null,
          isDeleted: false,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upsertedId: result.upsertedId ?? null,
      db: db.databaseName,
    });
  } catch (e: any) {
    console.error("POST /api/onboarding/photos failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
