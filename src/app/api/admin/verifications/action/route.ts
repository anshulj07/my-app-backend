import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../../../lib/mongodb";
import { UTApi } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const { clerkUserId, action } = await req.json(); // action = "approve" | "reject"

    if (!clerkUserId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const users = db.collection("users");

    const doc = await users.findOne({ clerkUserId });
    if (!doc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const status = action === "approve" ? "verified" : "rejected";

    // If rejected, maybe we delete the verificationImage from UT to save space
    if (action === "reject" && doc.profile?.verificationImage?.key) {
      await utapi.deleteFiles(doc.profile.verificationImage.key).catch((err) => {
        console.error("[POST] failed to delete rejected verification image from UT:", err);
      });
    }

    await users.updateOne(
      { clerkUserId },
      {
        $set: {
          "profile.verificationStatus": status,
          updatedAt: new Date(),
        }
      }
    );

    return NextResponse.json({ ok: true, status });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
