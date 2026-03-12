import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["Male", "Female", "Non-binary", "Prefer not to say", "Other"]);

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// GET — gender.tsx screen load pe call hota hai
export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "assis_auth");

  const user = await db.collection("users").findOne(
    { clerkUserId },
    { projection: { "profile.gender": 1 } }
  );

  return NextResponse.json({
    ok: true,
    gender: user?.profile?.gender ?? null,
  });
}

// ✅ POST — gender save
export async function POST(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const gender = String(body.gender ?? "").trim();
  if (!ALLOWED.has(gender)) {
    return NextResponse.json({ error: "Invalid gender option" }, { status: 400 });
  }

  const clerkUserId = String(body.clerkUserId || "").trim();
  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "assis_auth");

  const result = await db.collection("users").updateOne(
    { clerkUserId },
    {
      $set: {
        "profile.gender": gender,
        "onboarding.step": "interests",
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
    { upsert: true } // ✅ important
  );

  return NextResponse.json({
    ok: true,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
}