// src/app/api/events/upload-banner/route.ts
import { NextResponse } from "next/server";
import { UTApi, UTFile } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const utapi = new UTApi();

function requireApiKey(req: Request) {
  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY;
  return !API_KEY || apiKeyHeader !== API_KEY
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : null;
}

export async function POST(req: Request) {
  const authErr = requireApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageBase64: string = body?.imageBase64 ?? "";
  const mimeType: string = body?.mimeType ?? "image/jpeg";

  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const ext = mimeType === "image/png" ? "png" : "jpg";
    const fileName = `banner-${Date.now()}.${ext}`;
    const file = new UTFile([buffer], fileName, { type: mimeType });
    const uploaded = await utapi.uploadFiles([file]);
    const result = uploaded[0];
    if (result.error || !result.data?.ufsUrl) {
      throw new Error(result.error?.message ?? "No URL returned from UploadThing");
    }
    return NextResponse.json({ url: result.data.ufsUrl });
  } catch (e: any) {
    console.error("[upload-banner]", e?.message);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}
