// src/app/api/onboarding/status/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Step = "none" | "name" | "interests" | "about" | "photos" | "complete";

const STEP_TO_ROUTE: Record<Step, string> = {
  none: "/(onboarding)/name",
  name: "/(onboarding)/name",
  interests: "/(onboarding)/interests",
  about: "/(onboarding)/about",
  photos: "/(onboarding)/photos",
  complete: "/newApp/home",
};

export async function GET(req: Request) {
  try {
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    const API_KEY = process.env.EVENT_API_KEY;
    if (!API_KEY || apiKeyHeader !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clerkUserId = (searchParams.get("clerkUserId") || "").trim();
    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const users = db.collection("users");

    const doc = await users.findOne(
      { clerkUserId, isDeleted: { $ne: true } },
      { projection: { onboarding: 1 } }
    );

    // If user doc not found, force onboarding start.
    if (!doc) {
      return NextResponse.json(
        { completed: false, step: "name", nextRoute: "/(onboarding)/name" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const stepRaw = doc?.onboarding?.step;
    const completedRaw = doc?.onboarding?.completed;

    const step: Step =
      stepRaw === "none" ||
      stepRaw === "name" ||
      stepRaw === "interests" ||
      stepRaw === "about" ||
      stepRaw === "photos" ||
      stepRaw === "complete"
        ? stepRaw
        : "name";

    const completed = completedRaw === true || step === "complete";

    return NextResponse.json(
      {
        completed,
        step,
        nextRoute: completed ? undefined : STEP_TO_ROUTE[step],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("GET /api/onboarding/status failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
