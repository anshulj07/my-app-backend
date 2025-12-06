// src/app/api/onboarding/interests/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INTERESTS = 6;

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
    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const raw = body.interests;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "interests must be an array" }, { status: 400 });
    }

    // sanitize + unique + limit
    const interests = Array.from(
      new Set(
        raw
          .map((x: any) => String(x ?? "").trim())
          .filter((x: string) => x.length > 0)
      )
    ).slice(0, MAX_INTERESTS);

    if (interests.length < 1) {
      return NextResponse.json({ error: "Select at least 1 interest" }, { status: 400 });
    }

    const client = await clientPromise;

    // ✅ force correct DB + collection
    const db = client.db("assis_auth");
    const users = db.collection("users");

    const result = await users.updateOne(
      { clerkUserId },
      {
        $set: {
          "profile.interests": interests,

          // advance onboarding
          "onboarding.step": "about",
          "onboarding.completed": false,

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
      interestsCount: interests.length,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upsertedId: result.upsertedId ?? null,
      db: db.databaseName,
    });
  } catch (e: any) {
    console.error("POST /api/onboarding/interests failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
