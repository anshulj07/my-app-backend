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

/** ✅ Add ONLY these logs inside POST, before calling handler.POST(req) */
export async function POST(req: NextRequest) {
  console.log("🟨 [UT] POST /api/uploadthing");
  console.log("📌 url:", req.url);
  console.log("📌 content-type:", req.headers.get("content-type"));
  console.log("📌 content-length:", req.headers.get("content-length"));
  console.log("📌 x-api-key:", req.headers.get("x-api-key"));

  // ✅ LOG: raw JSON body for actionType=upload (without breaking the handler)
  try {
    const cloned = req.clone();                 // IMPORTANT: clone so handler can still read the body
    const raw = await cloned.text();            // body is JSON for actionType=upload
    console.log("📦 [UT] raw body:", raw);

    // optional: parse safely
    try {
      const parsed = JSON.parse(raw);
      console.log("📦 [UT] parsed body keys:", Object.keys(parsed || {}));
      console.log("📦 [UT] parsed body sample:", parsed);
    } catch {
      console.log("📦 [UT] body is not valid JSON");
    }
  } catch (e) {
    console.log("🟥 [UT] failed to read body:", e);
  }

  // ✅ Wrap handler call to log the 400 response body if any
  const res = await handler.POST(req);
  if (!res.ok) {
    try {
      const txt = await res.clone().text();
      console.log("🟥 [UT] handler response status:", res.status);
      console.log("🟥 [UT] handler response body:", txt);
    } catch (e) {
      console.log("🟥 [UT] failed to read handler response body:", e);
    }
  }
  return res;
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
