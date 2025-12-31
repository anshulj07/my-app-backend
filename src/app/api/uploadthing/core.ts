// app/api/uploadthing/core.ts
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

const f = createUploadthing();

const photosRoute = () =>
  f({ image: { maxFileSize: "8MB", maxFileCount: 6 } })

    // 🔍 LOG 1: confirm route is initialized
    .input(z.any()) // 👈 TEMP: bypass validation so middleware runs

    // 🔍 LOG 2: middleware entry (only runs AFTER input validation)
    .middleware(async ({ req, input }) => {
      console.log("🟦 [UT] Middleware ENTERED");
      console.log("🟦 [UT] Raw headers:");
      console.log("   content-type:", req.headers.get("content-type"));
      console.log("   x-api-key:", req.headers.get("x-api-key"));

      console.log("🟦 [UT] Parsed input:", input);

      const apiKey = req.headers.get("x-api-key");
      const expected = process.env.EVENT_API_KEY;

      console.log("🟦 [UT] expected EVENT_API_KEY:", expected);

      if (expected && apiKey !== expected) {
        console.error("🟥 [UT] API KEY MISMATCH");
        throw new UploadThingError("Unauthorized: invalid x-api-key");
      }

      return { clerkUserId: input.clerkUserId };
    })

    // 🔍 LOG 3: upload completion
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("🟩 [UT] Upload complete");
      console.log("🟩 metadata:", metadata);
      console.log("🟩 file:", file);

      return {
        url: file.ufsUrl,
        key: file.key,
        clerkUserId: metadata.clerkUserId,
      };
    });

export const ourFileRouter = {
  profilePhotos: photosRoute(),
  imageUploader: photosRoute(),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
