import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

function requireApiKey(req: Request) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  return got === expected ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });

  const client = await clientPromise;

  // ✅ your users are here:
  const db = client.db("assist_users");

  const user = await db.collection("users").findOne(
    { clerkUserId }, // ✅ matches your screenshot field name
    { projection: { clerkUserId: 1, profile: 1 } }
  );

  return NextResponse.json({ ok: true, user }, { status: 200 });
}
