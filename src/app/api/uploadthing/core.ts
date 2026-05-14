// app/api/uploadthing/core.ts
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

const f = createUploadthing();

const photosRoute = () =>
  f({ image: { maxFileSize: "8MB", maxFileCount: 6 } })
    .middleware(async ({ req }) => {
      const apiKey = req.headers.get("x-api-key");
      const expected = process.env.EVENT_API_KEY;

      console.log("🟦 [UT] Middleware called");
      console.log("🟦 [UT] x-api-key:", apiKey);
      console.log("🟦 [UT] expected EVENT_API_KEY:", expected);

      if (expected && apiKey !== expected) {
        console.error("🟥 [UT] API KEY MISMATCH");
        throw new UploadThingError("Unauthorized: invalid x-api-key");
      }

      const clerkUserId = req.headers.get("x-clerk-user-id") ?? null;
      console.log("🟦 [UT] x-clerk-user-id:", clerkUserId);

      return { clerkUserId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("🟩 [UT] Upload complete");
      console.log("🟩 metadata:", metadata);
      console.log("🟩 file:", file);

      return {
        url: file.url,
        key: file.key,
        clerkUserId: metadata.clerkUserId,
      };
    });

export const ourFileRouter = {
  // ✅ profile photos
  profilePhotos: photosRoute(),

  // ✅ event banners
  bannerImage: photosRoute(),

  // ✅ alias slug (what your client is STILL calling)
  imageUploader: photosRoute(),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
