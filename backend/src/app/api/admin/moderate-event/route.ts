// app/api/admin/moderate-event/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

function requireApiKey(req: Request) {
  const key = process.env.EVENT_API_KEY;
  if (!key) return null;
  return req.headers.get("x-api-key") === key
    ? null
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const guard = requireApiKey(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const { eventId, action, moderatorNote } = body;

    if (!eventId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("assis_auth");
    const _id = new ObjectId(eventId);

    // Find event
    let event = await db.collection("events").findOne({ _id });
    let collection = "events";
    
    if (!event) {
      event = await db.collection("services").findOne({ _id });
      collection = "services";
    }

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const isApproved = action === "approve";

    // Update event
    await db.collection(collection).updateOne(
      { _id },
      {
        $set: {
          admin_status: isApproved ? "approved" : "rejected",
          moderationStatus: isApproved ? "approved" : "rejected",
          isApproved,
          moderatedAt: new Date(),
          moderatorNote: moderatorNote || "",
          updatedAt: new Date(),
        },
      }
    );
// Event ka aiAnalysis fetch karo
const flags = event.aiAnalysis?.flags || [];
const finalNote = moderatorNote || 
  (event.aiAnalysis ? `AI Risk Score: ${event.aiAnalysis.riskScore}/100 — ${event.aiAnalysis.summary} ${event.aiAnalysis.recommendation}` : "");

    // ✅ CREATE NOTIFICATION — ye popup trigger karega
    await db.collection("notifications").insertOne({
  type: isApproved ? "event_approved" : "event_rejected",
  recipientClerkId: event.creatorClerkId,
  eventId: eventId,
  eventTitle: event.title || "Your Event",
  message: isApproved
    ? "Your event is now live on MyApp!"
    : `Your event "${event.title}" was rejected.`,
  moderatorNote: finalNote || null,   // ← null rakhna agar empty ho
  flags: flags,                        // ← FLAGS ADD KARO
  read: false,
  createdAt: new Date(),
});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", detail: e?.message }, { status: 500 });
  }
}