// app/api/onboarding/gender/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["Male", "Female", "Non-binary", "Prefer not to say", "Other"]);

export async function POST(req: Request) {
  const { userId, isAuthenticated } = await auth();

  // Optional fallback (not recommended for prod)
  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY || process.env.ONBOARDING_API_KEY || "";

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const gender = String(body.gender ?? "").trim();
  if (!ALLOWED.has(gender)) {
    return NextResponse.json({ error: "Invalid gender option" }, { status: 400 });
  }

  // Decide which clerkUserId to use
  let clerkUserId: string | null = null;

  if (isAuthenticated && userId) {
    clerkUserId = userId;
  } else if (API_KEY && apiKeyHeader === API_KEY && body.clerkUserId) {
    clerkUserId = String(body.clerkUserId);
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();
  const users = db.collection("users");

  // Update app profile fields (NOT Clerk fields)
  const result = await users.updateOne(
    { clerkUserId },
    {
      $set: {
        "profile.gender": gender,

        // next step
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
    }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json(
      { error: "User record not found. Webhook may not have created the user yet." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
}
