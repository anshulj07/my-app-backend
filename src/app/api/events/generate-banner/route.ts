// src/app/api/events/generate-banner/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { UTApi, UTFile } from "uploadthing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const utapi = new UTApi();

// Category → style guidance appended to user prompt
const CATEGORY_STYLE: Record<string, string> = {
  tech:        "dark tech aesthetic, blue and purple gradient, minimal, clean lines, no people",
  music:       "vibrant concert atmosphere, neon bokeh lighting, stage energy, no text",
  fitness:     "dynamic motion energy, bold contrast, athletic, gym or outdoor setting, no text",
  food:        "warm inviting food photography, rich colors, cozy ambiance, no text",
  networking:  "modern professional space, bright airy coworking aesthetic, warm light, no text",
  art:         "creative gallery aesthetic, vivid painterly color, artistic composition, no text",
  outdoor:     "golden hour landscape, wide open nature, adventure, cinematic, no text",
  party:       "festive celebration, confetti, bokeh lights, vibrant joyful energy, no text",
  startup:     "clean minimal startup aesthetic, white space, bold accent colors, no text",
  wellness:    "calm serene, soft pastels, zen minimalism, gentle lighting, no text",
  sports:      "stadium energy, dynamic action, bold saturated colors, no text",
  photography: "golden hour depth, bokeh foreground, artistic framing, no text",
  default:     "modern professional event banner, vibrant colors, clean composition, no text",
};

function buildDallePrompt(userPrompt: string, category: string): string {
  const style = CATEGORY_STYLE[category.toLowerCase()] ?? CATEGORY_STYLE.default;
  return `Event banner image: ${userPrompt.trim()}. Style: ${style}. Wide 16:9 format, photorealistic, high quality, no watermarks, no logos, no overlaid text.`;
}

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

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt: string = String(body?.prompt ?? "").trim();
  const category: string = String(body?.category ?? "default").trim().toLowerCase();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const dallePrompt = buildDallePrompt(prompt, category);

  // Generate via DALL-E 3 (1792×1024 = closest native 16:9)
  let imageUrl: string;
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: dallePrompt,
      n: 1,
      size: "1792x1024",
      quality: "standard",
      response_format: "url",
    });
    imageUrl = response.data[0]?.url ?? "";
    if (!imageUrl) throw new Error("No image URL returned from DALL-E");
  } catch (e: any) {
    console.error("[generate-banner] DALL-E error:", e?.message);
    const msg = e?.message?.includes("content policy")
      ? "Your prompt was flagged by content policy. Please rephrase and try again."
      : "AI image generation failed. Please try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Fetch the temporary DALL-E URL and re-upload to UploadThing for a permanent URL
  let permanentUrl: string;
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
    const buffer = await imgRes.arrayBuffer();
    const fileName = `ai-banner-${Date.now()}.png`;
    const file = new UTFile([buffer], fileName, { type: "image/png" });
    const uploaded = await utapi.uploadFiles([file]);
    const result = uploaded[0];
    if (result.error || !result.data?.ufsUrl) {
      throw new Error(result.error?.message ?? "No URL returned from UploadThing");
    }
    permanentUrl = result.data.ufsUrl;
  } catch (e: any) {
    console.error("[generate-banner] UploadThing upload failed:", e?.message);
    // Fall back to temporary DALL-E URL if re-upload fails
    permanentUrl = imageUrl;
  }

  return NextResponse.json({ url: permanentUrl });
}
