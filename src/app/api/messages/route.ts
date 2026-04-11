// app/api/messages/route.ts
// GET  /api/messages?from=X&to=Y&limit=100
// POST /api/messages

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

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
  // Accept both old (from/to) and new (fromClerkUserId/toClerkUserId) param names
  const from  = (searchParams.get("fromClerkUserId") || searchParams.get("from"))?.trim();
  const to    = (searchParams.get("toClerkUserId")   || searchParams.get("to"))?.trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

  if (!from || !to) {
    return NextResponse.json({ error: "fromClerkUserId and toClerkUserId are required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    const messages = await db.collection(COLL)
      .find({
        $or: [
          { fromClerkUserId: from, toClerkUserId: to },
          { fromClerkUserId: to,   toClerkUserId: from },
        ],
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    const formatted = messages.map(m => ({
      _id:             m._id.toString(),
      id:              m._id.toString(),
      fromClerkUserId: m.fromClerkUserId,
      toClerkUserId:   m.toClerkUserId,
      senderId:        m.fromClerkUserId,   // legacy compat
      text:            m.text,
      createdAt:       m.createdAt,
      status:          m.status || "sent",
    }));

    await db.collection(COLL).updateMany(
      { fromClerkUserId: to, toClerkUserId: from, status: { $ne: "read" } },
      { $set: { status: "read" } }
    );

    return NextResponse.json({ messages: formatted });
  } catch (e: any) {
    console.error("[GET /api/messages]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fromClerkUserId, toClerkUserId, text } = body;

  if (!fromClerkUserId || !toClerkUserId || !text?.trim()) {
    return NextResponse.json({ error: "fromClerkUserId, toClerkUserId and text are required" }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db     = client.db(DB);

    const doc = {
      fromClerkUserId: fromClerkUserId.trim(),
      toClerkUserId:   toClerkUserId.trim(),
      text:            text.trim(),
      createdAt:       new Date().toISOString(),
      status:          "sent" as const,
    };

    const result = await db.collection(COLL).insertOne(doc);

    return NextResponse.json({
      message: {
        id:        result.insertedId.toString(),
        senderId:  doc.fromClerkUserId,
        text:      doc.text,
        createdAt: doc.createdAt,
        status:    doc.status,
      }
    }, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/messages]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}