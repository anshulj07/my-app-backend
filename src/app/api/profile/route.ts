// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    const API_KEY = process.env.EVENT_API_KEY;

    if (!API_KEY || apiKeyHeader !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clerkUserId = String(searchParams.get("clerkUserId") || "").trim();
    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const users = db.collection("users");

    // Keep "never 404": create an empty doc if missing (doesn't touch onboarding)
    await users.updateOne(
      { clerkUserId },
      {
        $setOnInsert: {
          clerkUserId,
          profile: {
            firstName: null,
            lastName: null,
            about: null,
            gender: null,
            age: null,
            interests: [],
            photos: [],
            location: null,
          },
          onboarding: { completed: false, step: "name" },
          createdAt: new Date(),
          deletedAt: null,
          isDeleted: false,
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );

    const doc = await users.findOne(
      { clerkUserId, isDeleted: { $ne: true } },
      { projection: { _id: 0, clerkUserId: 1, profile: 1, clerk: 1, onboarding: 1 } }
    );

    const safeDoc: any = doc ?? {};
    const p: any = safeDoc.profile ?? {};
    const c: any = safeDoc.clerk ?? {};

    const firstName = String(p.firstName ?? c.firstName ?? "").trim();
    const lastName = String(p.lastName ?? c.lastName ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();

    return NextResponse.json(
      {
        clerkUserId,
        name: name || "Your Name",
        username: typeof p.username === "string" ? p.username : "", // keep if you’re using it
        about: typeof p.about === "string" ? p.about : "",
        interests: Array.isArray(p.interests) ? p.interests : [],
        languages: Array.isArray(p.languages) ? p.languages : [], // keep if you’re using it
        photos: Array.isArray(p.photos) ? p.photos : [],
        onboarding: safeDoc.onboarding ?? null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("GET /api/profile failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
