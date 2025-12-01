// app/api/onboarding/about/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        "profile.about": 1,
        onboarding: 1,
      },
    }
  );

  if (!doc) {
    return NextResponse.json({ error: "User record not found" }, { status: 404 });
  }

  const about = typeof (doc as any)?.profile?.about === "string" ? (doc as any).profile.about : "";

  return NextResponse.json({ ok: true, about, onboarding: (doc as any)?.onboarding ?? {} });
}

export async function POST(req: Request) {
  const { userId, isAuthenticated } = await auth();

  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY || process.env.ONBOARDING_API_KEY || "";

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const about = String(body.about ?? "").trim();
  if (about.length < 10) {
    return NextResponse.json({ error: "About must be at least 10 characters" }, { status: 400 });
  }
  if (about.length > 500) {
    return NextResponse.json({ error: "About must be at most 500 characters" }, { status: 400 });
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
        "profile.about": about,

        // advance onboarding
        "onboarding.step": "photos",
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

  return NextResponse.json({ ok: true, about, modified: result.modifiedCount });
}
