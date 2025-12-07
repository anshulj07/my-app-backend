import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { UTApi } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 5;

const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN, // ✅ correct for UTApiOptions
});

type PhotoObj = { url: string; key?: string; uploadedAt?: Date };

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

function normalizePhotos(raw: any): PhotoObj[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => {
      if (typeof p === "string" && p.trim()) return { url: p.trim() };
      if (p && typeof p === "object" && typeof p.url === "string" && p.url.trim()) {
        return { url: p.url.trim(), key: typeof p.key === "string" ? p.key : undefined };
      }
      return null;
    })
    .filter(Boolean) as PhotoObj[];
}

async function getUsersCollection() {
  const client = await clientPromise;
  // ✅ you said: assist_users -> users
  const db = client.db("assist_users");
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

  const current = normalizePhotos(doc?.profile?.photos);
  if (current.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Max ${MAX_PHOTOS} photos allowed` }, { status: 400 });
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
  const url: string = data?.url || data?.ufsUrl; // ✅ handle both shapes
  if (!key || !url) return NextResponse.json({ error: "UploadThing returned no url/key" }, { status: 500 });

  const newPhoto: PhotoObj = { key, url, uploadedAt: new Date() };

  await users.updateOne(
    { clerkUserId },
    {
      $push: { "profile.photos": newPhoto } as any,
      $set: { updatedAt: new Date() },
      $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
    } as any,
    { upsert: true }
  );

  const updated = await users.findOne({ clerkUserId });
  const photoUrls = normalizePhotos(updated?.profile?.photos).map((p) => p.url);

  return NextResponse.json({ ok: true, uploaded: { key, url }, photos: photoUrls, count: photoUrls.length });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const clerkUserId = getClerkUserId(req);
  if (!clerkUserId) return NextResponse.json({ error: "Missing clerkUserId" }, { status: 400 });

  // allow uri via JSON body OR query param
  const body = await req.json().catch(() => ({}));
  const uriFromBody = typeof body?.uri === "string" ? body.uri.trim() : "";
  const uriFromQuery = (req.nextUrl.searchParams.get("uri") || "").trim();
  const uri = uriFromBody || uriFromQuery;

  if (!uri) return NextResponse.json({ error: "Missing uri" }, { status: 400 });

  const { users } = await getUsersCollection();
  const doc = await users.findOne({ clerkUserId });
  if (!doc) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const photos = normalizePhotos(doc?.profile?.photos);
  if (photos.length <= MIN_PHOTOS) {
    return NextResponse.json({ error: `Keep at least ${MIN_PHOTOS} photos` }, { status: 400 });
  }

  const target = photos.find((p) => p.url === uri);
  if (!target) return NextResponse.json({ error: "Photo not found in DB" }, { status: 404 });

  // delete from UploadThing if we have a key
  if (target.key) {
    await utapi.deleteFiles(target.key);
    await users.updateOne({ clerkUserId }, { $pull: { "profile.photos": { key: target.key } } as any });
  } else {
    // old url-only entries: delete only from DB
    await users.updateOne({ clerkUserId }, { $pull: { "profile.photos": uri } as any });
    await users.updateOne({ clerkUserId }, { $pull: { "profile.photos": { url: uri } } as any });
  }

  const updated = await users.findOne({ clerkUserId });
  const photoUrls = normalizePhotos(updated?.profile?.photos).map((p) => p.url);

  return NextResponse.json({ ok: true, deleted: { url: uri, key: target.key ?? null }, photos: photoUrls, count: photoUrls.length });
}
