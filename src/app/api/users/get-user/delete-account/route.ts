// app/api/users/delete-account/route.ts
// 🆕 NEW — Soft delete user account
// DELETE /api/users/delete-account
// Body: { clerkUserId }

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../../lib/mongodb";

export const dynamic = "force-dynamic";

function checkApiKey(req: NextRequest): NextResponse | null {
  const key      = req.headers.get("x-api-key");
  const expected = process.env.EVENT_API_KEY;
  if (expected && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const DB = "assis_auth";

export async function DELETE(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clerkUserId } = body;
  if (!clerkUserId?.trim()) {
    return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    // Soft delete: mark as deleted, anonymise PII
    await db.collection("users").updateOne(
      { clerkUserId: clerkUserId.trim() },
      {
        $set: {
          isDeleted:    true,
          deletedAt:    new Date(),
          updatedAt:    new Date(),
          // Anonymise personal data
          "clerk.email":       null,
          "clerk.firstName":   "Deleted",
          "clerk.lastName":    "User",
          "clerk.imageUrl":    null,
          "profile.firstName": "Deleted",
          "profile.lastName":  "User",
          "profile.avatar":    null,
          "profile.photos":    [],
          "profile.about":     "",
          "profile.username":  null,
        },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[DELETE /api/users/delete-account]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}