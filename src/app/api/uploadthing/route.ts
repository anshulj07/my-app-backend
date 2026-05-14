// app/api/uploadthing/route.ts
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";
import type { NextRequest } from "next/server";

console.log("🟣 [UT] UploadThing route loaded");

const handler = createRouteHandler({
  router: ourFileRouter,
  config: {
    logLevel: "Debug",
  },
});

export async function POST(req: NextRequest) {
  console.log("🟨 [UT] POST /api/uploadthing");
  console.log("📌 content-type:", req.headers.get("content-type"));
  console.log("📌 content-length:", req.headers.get("content-length"));
  console.log("📌 x-api-key:", req.headers.get("x-api-key"));
  console.log("📌 x-clerk-user-id:", req.headers.get("x-clerk-user-id"));

  try {
    return await handler.POST(req);
  } catch (err: any) {
    console.error("🟥 [UT] POST error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "UploadThing POST error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function GET(req: NextRequest) {
  console.log("🟦 [UT] GET /api/uploadthing");
  try {
    return await handler.GET(req);
  } catch (err: any) {
    console.error("🟥 [UT] GET error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "UploadThing GET error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
