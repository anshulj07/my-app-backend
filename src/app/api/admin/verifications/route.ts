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

export async function GET(req: Request) {
  try {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const { users } = await getUsersCollection();
    
    // Find all users with pending verification
    const pendingUsers = await users.find(
      { "verification.status": "pending" },
      { projection: { clerkUserId: 1, profile: 1, verification: 1 } }
    ).toArray();

    return NextResponse.json({ success: true, users: pendingUsers });
  } catch (e: any) {
    console.error("GET /api/admin/verifications failed:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const body = await req.json().catch(() => null);
    if (!body || !body.clerkUserId || !body.action) {
      return NextResponse.json({ error: "clerkUserId and action are required" }, { status: 400 });
    }

    const { clerkUserId, action } = body; // action: 'approve' | 'reject'
    const { users } = await getUsersCollection();

    if (action === "approve") {
      await users.updateOne(
        { clerkUserId },
        {
          $set: {
            "verification.status": "verified",
            "verification.idVerified": true,
            "verification.verifiedAt": new Date(),
            updatedAt: new Date(),
          },
        }
      );
    } else if (action === "reject") {
      await users.updateOne(
        { clerkUserId },
        {
          $set: {
            "verification.status": "rejected",
            "verification.idVerified": false,
            "verification.rejectedAt": new Date(),
            "verification.rejectionReason": body.reason || "Documents could not be verified",
            updatedAt: new Date(),
          },
        }
      );
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `User verification ${action}ed` });
  } catch (e: any) {
    console.error("POST /api/admin/verifications failed:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
