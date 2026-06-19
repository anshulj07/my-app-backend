// src/app/api/onboarding/about/route.ts
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
    const aboutRaw = String(body.about ?? "");
    const about = aboutRaw.trim();

    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    if (about.length < 10) {
      return NextResponse.json({ error: "About must be at least 10 characters" }, { status: 400 });
    }

    // keep DB tidy
    const aboutClamped = about.slice(0, 500);

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const users = db.collection("users");

    const result = await users.updateOne(
      { clerkUserId },
      {
        $set: {
          "profile.about": aboutClamped,

          // move to next onboarding screen in your flow
          "onboarding.step": "photos", // ✅ add "photos" to your TS union if you want strict typing
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
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upsertedId: result.upsertedId ?? null,
      db: db.databaseName,
    });
  } catch (e: any) {
    console.error("POST /api/onboarding/about failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
