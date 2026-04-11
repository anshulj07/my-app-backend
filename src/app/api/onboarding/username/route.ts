// app/api/onboarding/username/route.ts
// POST /api/onboarding/username        — set username
// GET  /api/onboarding/username/check  — check availability

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB = "assis_auth";

// Only lowercase letters, digits, underscores — 3–30 chars
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// Basic reserved/blocked words
const RESERVED = new Set([
  "admin", "administrator", "root", "support", "system", "official",
  "meetup", "help", "api", "null", "undefined", "delete", "mod", "moderator",
]);

function isBlocked(u: string) {
  return RESERVED.has(u) || /^[_.]+$/.test(u) || u.startsWith("_") || u.endsWith("_");
}

function checkApiKey(req: NextRequest): NextResponse | null {
  const key      = req.headers.get("x-api-key");
  const expected = process.env.EVENT_API_KEY;
  if (expected && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ── POST /api/onboarding/username ─────────────────────────────
export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clerkUserId = String(body?.clerkUserId || "").trim();
  const raw         = String(body?.username    || "").trim().toLowerCase();

  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
  if (!raw)         return NextResponse.json({ error: "username is required" }, { status: 400 });

  if (!USERNAME_RE.test(raw))
    return NextResponse.json({
      error: "Username must be 3–30 chars: lowercase letters, numbers, underscores only.",
    }, { status: 400 });

  if (isBlocked(raw))
    return NextResponse.json({ error: "That username is not available." }, { status: 400 });

  const client = await clientPromise;
  const db     = client.db(DB);
  const users  = db.collection("users");

  // Uniqueness check (case-insensitive): exclude the requesting user
  const existing = await users.findOne({
    "profile.username": raw,
    clerkUserId: { $ne: clerkUserId },
  });
  if (existing) {
    return NextResponse.json({ error: "Username is already taken. Try another one." }, { status: 409 });
  }

  await users.updateOne(
    { clerkUserId },
    {
      $set: {
        "profile.username":   raw,
        "onboarding.step":    "dateOfBirth",
        "onboarding.completed": false,
        updatedAt:            new Date(),
      },
      $setOnInsert: { clerkUserId, createdAt: new Date(), isDeleted: false },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, username: raw });
}

// ── GET /api/onboarding/username?q=myhandle&clerkUserId=X ─────
export async function GET(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const q           = (searchParams.get("q") || "").trim().toLowerCase();
  const clerkUserId = (searchParams.get("clerkUserId") || "").trim();

  if (!q) return NextResponse.json({ available: false, error: "q is required" }, { status: 400 });

  if (!USERNAME_RE.test(q))
    return NextResponse.json({ available: false, reason: "invalid_format" });

  if (isBlocked(q))
    return NextResponse.json({ available: false, reason: "blocked" });

  const client = await clientPromise;
  const db     = client.db(DB);

  const existing = await db.collection("users").findOne({
    "profile.username": q,
    ...(clerkUserId ? { clerkUserId: { $ne: clerkUserId } } : {}),
  });

  return NextResponse.json({ available: !existing, username: q });
}
