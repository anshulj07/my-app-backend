import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { UTApi } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

function requireApiKey(req: NextRequest) {
  const expected = process.env.EVENT_API_KEY;
  if (!expected) return null;
  const got = req.headers.get("x-api-key");
  if (got !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

function getClerkUserId(req: NextRequest) {
  return (req.nextUrl.searchParams.get("clerkUserId") || "").trim();
}

async function getUsersCollection() {
  const client = await clientPromise;
  const db = client.db("assis_auth");
  const users = db.collection("users");
  return { users };
}

export async function POST(req: NextRequest) {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const clerkUserId = getClerkUserId(req);
  if (!clerkUserId) return NextResponse.json({ error: "Missing clerkUserId" }, { status: 400 });

  const { users } = await getUsersCollection();
  const doc = await users.findOne({ clerkUserId });

  if (!doc) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!file || typeof (file as any).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Missing file (field name must be 'file')" }, { status: 400 });
  }
  if (typeof (file as any).type === "string" && !(file as any).type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads allowed" }, { status: 400 });
  }

  const up = await utapi.uploadFiles(file as any);

  const r = Array.isArray(up) ? up[0] : up;
  if (!r || (r as any).error) {
    return NextResponse.json({ error: (r as any)?.error?.message || "Upload failed" }, { status: 500 });
  }

  const data: any = (r as any).data;
  const key: string = data?.key;
  const url: string = data?.ufsUrl || data?.url;
  if (!key || !url) return NextResponse.json({ error: "UploadThing returned no url/key" }, { status: 500 });

  const newVerificationImage = { key, url, uploadedAt: new Date() };

  // If there was an old rejected verification image, maybe we delete it to save space
  if (doc?.profile?.verificationImage?.key) {
    await utapi.deleteFiles(doc.profile.verificationImage.key).catch((err) => {
      console.error("[POST] failed to delete old verification image from UT:", err);
    });
  }

  await users.updateOne(
    { clerkUserId },
    {
      $set: {
        "profile.verificationStatus": "pending",
        "profile.verificationImage": newVerificationImage,
        updatedAt: new Date(),
      },
      $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
    },
    { upsert: true }
  );

  return NextResponse.json({
    ok: true,
    uploaded: { key, url },
    status: "pending",
  });
}
