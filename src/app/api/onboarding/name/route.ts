import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    const API_KEY = process.env.EVENT_API_KEY;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const clerkUserId = String(body.clerkUserId || "").trim();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();

    if (!API_KEY || apiKeyHeader !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    if (firstName.length < 1) {
      return NextResponse.json({ error: "First name is required" }, { status: 400 });
    }

    const client = await clientPromise;

    // ✅ force correct DB + collection
    const db = client.db("assis_auth");
    const users = db.collection("users");

    const result = await users.updateOne(
      { clerkUserId },
      {
        $set: {
          // app profile fields
          "profile.firstName": firstName,
          "profile.lastName": lastName.length ? lastName : null,
        
          // mirror into clerk snapshot in DB
          "clerk.firstName": firstName,
          "clerk.lastName": lastName.length ? lastName : null,
        
          "onboarding.step": "dateOfBirth",
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
      { upsert: true } // ✅ required (since we use $setOnInsert)
    );

    return NextResponse.json({
      ok: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upsertedId: result.upsertedId ?? null,
      db: db.databaseName,
    });
  } catch (e: any) {
    console.error("POST /api/onboarding/name failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
