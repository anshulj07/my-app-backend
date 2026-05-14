import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY;
  return !API_KEY || apiKeyHeader !== API_KEY
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : null;
}

function getUsersCollection() {
  return clientPromise.then((client) => {
    const db = client.db("assis_auth");
    const users = db.collection("users");
    return { db, users };
  });
}

export async function POST(req: Request) {
  try {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const body = await req.json().catch(() => null);
    if (!body || !body.clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const { clerkUserId, selfieUrl } = body;
    const { users } = await getUsersCollection();

    // Set status to pending and store selfie URL
    await users.updateOne(
      { clerkUserId },
      {
        $set: {
          "verification.status": "pending",
          "verification.selfieUrl": selfieUrl,
          "verification.idVerified": false,
          "verification.submittedAt": new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ 
      success: true, 
      message: "Verification request submitted. Status is now pending." 
    });
  } catch (e: any) {
    console.error("POST /api/profile/verify failed:", e);
    return NextResponse.json(
      { error: "Internal Server Error", detail: e.message },
      { status: 500 }
    );
  }
}
