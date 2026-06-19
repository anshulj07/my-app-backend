import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { UTApi } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTOS = 20;
const MIN_PHOTOS = 0;

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
  const url: string = data?.ufsUrl || data?.url; // prefer ufsUrl; url is deprecated in UT v9
  if (!key || !url) return NextResponse.json({ error: "UploadThing returned no url/key" }, { status: 500 });

  const isAvatar = req.nextUrl.searchParams.get("isAvatar") === "true";
  const replaceUri = req.nextUrl.searchParams.get("replaceUri");
  const newPhoto: PhotoObj = { key, url, uploadedAt: new Date() };

  if (isAvatar) {
    // If it's a replacement, try to delete the old avatar from UT
    if (doc?.profile?.avatar?.key) {
      await utapi.deleteFiles(doc.profile.avatar.key).catch((err) => {
        console.error("[POST] failed to delete old avatar from UT:", err);
      });
    }

    await users.updateOne(
      { clerkUserId },
      {
        $set: {
          "profile.avatar": newPhoto,
          updatedAt: new Date(),
        },
        $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
      },
      { upsert: true }
    );
  } else if (replaceUri) {
    const currentPhotos = normalizePhotos(doc?.profile?.photos);
    const index = currentPhotos.findIndex((p) => p.url === replaceUri);

    if (index !== -1) {
      // Delete old photo if it had a key
      const oldPhoto = currentPhotos[index];
      if (oldPhoto.key) {
        await utapi.deleteFiles(oldPhoto.key).catch((err) => {
          console.error("[POST] failed to delete old file from UT:", err);
        });
      }

      await users.updateOne(
        { clerkUserId },
        {
          $set: {
            [`profile.photos.${index}`]: newPhoto,
            updatedAt: new Date(),
          },
        }
      );
    } else {
      // Fallback: if replaceUri not found, just push
      await users.updateOne(
        { clerkUserId },
        {
          $push: { "profile.photos": newPhoto } as any,
          $set: { updatedAt: new Date() },
          $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
        } as any,
        { upsert: true }
      );
    }
  } else {
    await users.updateOne(
      { clerkUserId },
      {
        $push: { "profile.photos": newPhoto } as any,
        $set: { updatedAt: new Date() },
        $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
      } as any,
      { upsert: true }
    );
  }

  const updated = await users.findOne({ clerkUserId });
  const photoUrls = normalizePhotos(updated?.profile?.photos).map((p) => p.url);
  const avatarUrl = updated?.profile?.avatar?.url || null;

  return NextResponse.json({
    ok: true,
    uploaded: { key, url },
    photos: photoUrls,
    avatar: avatarUrl,
    count: photoUrls.length,
  });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = requireApiKey(req);
  if (unauthorized) return unauthorized;

  const clerkUserId = getClerkUserId(req);
  if (!clerkUserId) return NextResponse.json({ error: "Missing clerkUserId" }, { status: 400 });

  const isAvatar = req.nextUrl.searchParams.get("isAvatar") === "true";

  // allow uri via JSON body OR query param
  const body = await req.json().catch(() => ({}));
  const uriFromBody = typeof body?.uri === "string" ? body.uri.trim() : "";
  const uriFromQuery = (req.nextUrl.searchParams.get("uri") || "").trim();
  const uri = uriFromBody || uriFromQuery;

  const { users } = await getUsersCollection();
  const doc = await users.findOne({ clerkUserId });
  if (!doc) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isAvatar) {
    const avatar = doc?.profile?.avatar;
    if (!avatar) return NextResponse.json({ error: "No avatar to delete" }, { status: 404 });

    if (avatar.key) {
      await utapi.deleteFiles(avatar.key).catch((err) => {
        console.error("[DELETE] failed to delete avatar from UT:", err);
      });
    }

    await users.updateOne({ clerkUserId }, { $unset: { "profile.avatar": "" } } as any);

    const updated = await users.findOne({ clerkUserId });
    return NextResponse.json({
      ok: true,
      deleted: { url: avatar.url, key: avatar.key ?? null },
      photos: normalizePhotos(updated?.profile?.photos).map((p) => p.url),
      avatar: null,
    });
  }

  if (!uri) return NextResponse.json({ error: "Missing uri" }, { status: 400 });

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
