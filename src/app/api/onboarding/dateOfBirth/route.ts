// app/api/onboarding/dob/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function calcAgeFromISO(dobISO: string) {
  const d = new Date(`${dobISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export async function POST(req: Request) {
  const { userId, isAuthenticated } = await auth();

  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY || process.env.ONBOARDING_API_KEY || "";

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const dob = String(body.dob ?? "").trim(); // YYYY-MM-DD expected
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return NextResponse.json({ error: "dob must be YYYY-MM-DD" }, { status: 400 });
  }

  const age = calcAgeFromISO(dob);
  if (age === null) {
    return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
  }
  if (age < 18) {
    return NextResponse.json({ error: "You must be at least 18 years old" }, { status: 400 });
  }
  if (age > 100) {
    return NextResponse.json({ error: "Please select a valid date of birth" }, { status: 400 });
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
        "profile.dob": dob,
        "profile.age": age, // optional, but handy

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
    age,
  });
}
