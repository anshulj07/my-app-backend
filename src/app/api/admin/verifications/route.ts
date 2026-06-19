import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db("assis_auth");
    
    // Fetch users with verificationStatus === "pending"
    const pendingUsers = await db.collection("users").find({
      "profile.verificationStatus": "pending"
    }).toArray();

    const data = pendingUsers.map(user => ({
      _id: user._id.toString(),
      clerkUserId: user.clerkUserId,
      name: user.profile?.name || "Unknown",
      email: user.profile?.email || "Unknown",
      verificationImage: user.profile?.verificationImage?.url || null,
      verificationStatus: user.profile?.verificationStatus
    }));

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
