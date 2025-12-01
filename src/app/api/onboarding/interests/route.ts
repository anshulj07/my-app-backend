// app/api/onboarding/interests/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uniqStrings(arr: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function GET(req: Request) {
  const { userId, isAuthenticated } = await auth();

  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY || process.env.ONBOARDING_API_KEY || "";

  let clerkUserId: string | null = null;

  if (isAuthenticated && userId) {
    clerkUserId = userId;
  } else {
    const url = new URL(req.url);
    const paramUserId = url.searchParams.get("clerkUserId");
    if (API_KEY && apiKeyHeader === API_KEY && paramUserId) {
      clerkUserId = String(paramUserId);
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const client = await clientPromise;
  const db = client.db();
  const users = db.collection("users");

  const doc = await users.findOne(
    { clerkUserId },
    {
      projection: {
        _id: 0,
        "profile.interests": 1,
        onboarding: 1,
      },
    }
  );

  if (!doc) {
    return NextResponse.json({ error: "User record not found" }, { status: 404 });
  }

  const interests = Array.isArray((doc as any)?.profile?.interests) ? (doc as any).profile.interests : [];

  return NextResponse.json({ ok: true, interests, onboarding: (doc as any)?.onboarding ?? {} });
}

export async function POST(req: Request) {
  const { userId, isAuthenticated } = await auth();

  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY || process.env.ONBOARDING_API_KEY || "";

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const rawInterests = body.interests;
  if (!Array.isArray(rawInterests)) {
    return NextResponse.json({ error: "interests must be an array" }, { status: 400 });
  }

  const interests = uniqStrings(rawInterests);
  if (interests.length < 1) {
    return NextResponse.json({ error: "Pick at least one interest" }, { status: 400 });
  }

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
    }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json(
      { error: "User record not found. Webhook may not have created the user yet." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, interests, modified: result.modifiedCount });
}
