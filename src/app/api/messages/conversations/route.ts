// app/api/messages/conversations/route.ts
// GET /api/messages/conversations?clerkUserId=X

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";

export const dynamic = "force-dynamic";

function checkApiKey(req: NextRequest): NextResponse | null {
  const key      = req.headers.get("x-api-key");
  const expected = process.env.EVENT_API_KEY;
  if (expected && key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const DB   = process.env.MONGODB_DB || "assis_auth";
const COLL = "messages";

export async function GET(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const clerkUserId = searchParams.get("clerkUserId")?.trim();

  if (!clerkUserId) {
    return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    const allMsgs = await db.collection(COLL)
      .find({
        $or: [
          { fromClerkUserId: clerkUserId },
          { toClerkUserId:   clerkUserId },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Group by other user — keep latest message per conversation
    const convMap = new Map<string, any>();

    for (const msg of allMsgs) {
      const otherId = msg.fromClerkUserId === clerkUserId
        ? msg.toClerkUserId
        : msg.fromClerkUserId;

      if (!convMap.has(otherId)) {
        convMap.set(otherId, {
          otherId,
          lastMessage:   msg.text,
          lastMessageAt: msg.createdAt,
          unreadCount:   0,
        });
      }

      if (msg.toClerkUserId === clerkUserId && msg.status !== "read") {
        convMap.get(otherId).unreadCount++;
      }
    }

    const otherIds = Array.from(convMap.keys());

    const users = otherIds.length > 0
      ? await db.collection("users")
          .find({ clerkUserId: { $in: otherIds } })
          .project({
            clerkUserId: 1,
            "profile.firstName": 1, "profile.lastName": 1,
            "profile.avatar": 1,   "profile.photos": 1,
            "clerk.firstName": 1,  "clerk.lastName": 1, "clerk.imageUrl": 1,
          })
          .toArray()
      : [];

    const userMap = new Map(users.map(u => [u.clerkUserId, u]));

    const conversations = Array.from(convMap.values())
      .map(conv => {
        const user      = userMap.get(conv.otherId);
        const profile   = user?.profile || {};
        const clerkData = user?.clerk   || {};

        const fn   = profile.firstName || clerkData.firstName || "";
        const ln   = profile.lastName  || clerkData.lastName  || "";
        const name = [fn, ln].filter(Boolean).join(" ") || "Unknown User";
        const getStr = (val: any) => (typeof val === "string" ? val : val?.url || null);
        const rawAvatar = profile.avatar || profile.photos?.[0] || clerkData.imageUrl || null;
        const avatar = getStr(rawAvatar);

        return {
          otherUserId:   conv.otherId,
          otherName:     name,
          otherAvatar:   avatar || "",
          lastMessage:   conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount:   conv.unreadCount,
        };
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return NextResponse.json({ conversations });
  } catch (e: any) {
    console.error("[GET /api/messages/conversations]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}