// app/api/users/search/route.ts
// GET /api/users/search?q=rahul&limit=30

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../../lib/mongodb";

export const dynamic = "force-dynamic";

function checkApiKey(req: NextRequest): NextResponse | null {
  const key      = req.headers.get("x-api-key");
  const expected = process.env.EVENT_API_KEY;
  if (expected && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const DB = "assis_auth";

export async function GET(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const q     = searchParams.get("q")?.trim() || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

  if (!q || q.length < 1) {
    return NextResponse.json({ users: [] });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const users = await db.collection("users")
      .find({
        isDeleted: { $ne: true },
        $or: [
          { "profile.firstName": regex },
          { "profile.lastName":  regex },
          { "profile.username":  regex },
          { "clerk.firstName":   regex },
          { "clerk.lastName":    regex },
          { "clerk.email":       regex },
        ],
      })
      .limit(limit)
      .project({
        clerkUserId:         1,
        "profile.firstName": 1,
        "profile.lastName":  1,
        "profile.username":  1,
        "profile.avatar":    1,
        "profile.photos":    1,
        "profile.about":     1,
        "profile.verificationStatus": 1,
        "clerk.firstName":   1,
        "clerk.lastName":    1,
        "clerk.imageUrl":    1,
      })
      .toArray();

    const result = users.map(u => {
      const getStr = (val: any) => (typeof val === "string" ? val : val?.url || null);
      const avatar = getStr(u.profile?.avatar || u.clerk?.imageUrl);
      const firstPhoto = Array.isArray(u.profile?.photos) ? getStr(u.profile.photos[0]) : null;

      return {
        clerkUserId: u.clerkUserId,
        profile: {
          firstName: u.profile?.firstName || u.clerk?.firstName || "",
          lastName:  u.profile?.lastName  || u.clerk?.lastName  || "",
          username:  u.profile?.username  || null,
          avatar:    avatar || firstPhoto,
          photos:    firstPhoto ? [firstPhoto] : [],
          about:     u.profile?.about || "",
          isVerified: u.profile?.verificationStatus === "verified",
        },
        clerk: {
          firstName: u.clerk?.firstName || "",
          lastName:  u.clerk?.lastName  || "",
          imageUrl:  u.clerk?.imageUrl  || null,
        },
      };
    });

    return NextResponse.json({ users: result });
  } catch (e: any) {
    console.error("[GET /api/users/search]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}