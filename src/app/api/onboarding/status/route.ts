// src/app/api/onboarding/status/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Step =
  | "username"
  | "dateOfBirth"
  | "gender"
  | "interests"
  | "about"
  | "photos"
  | "complete";

const STEP_TO_ROUTE: Record<Step, string> = {
  username:    "/(onboarding)/username",
  dateOfBirth: "/(onboarding)/dateOfBirth",
  gender:      "/(onboarding)/gender",
  interests:   "/(onboarding)/interests",
  about:       "/(onboarding)/about",
  photos:      "/(onboarding)/photos",
  complete:    "/newApp/home",
};

const VALID_STEPS = new Set<Step>([
  "username", "dateOfBirth", "gender", "interests", "about", "photos", "complete",
]);

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
    const db     = client.db("assis_auth");
    const users  = db.collection("users");

    const doc = await users.findOne(
      { clerkUserId, isDeleted: { $ne: true } },
      { projection: { onboarding: 1 } }
    );

    // User doc not found — start from beginning
    if (!doc) {
      return NextResponse.json(
        { completed: false, step: "username", nextRoute: STEP_TO_ROUTE.username },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const stepRaw    = doc?.onboarding?.step;
    const completedRaw = doc?.onboarding?.completed;

    // Migrate legacy "name" / "none" steps to "username"
    const step: Step = VALID_STEPS.has(stepRaw) ? stepRaw : "username";
    const completed  = completedRaw === true || step === "complete";

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
