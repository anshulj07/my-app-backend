import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import clientPromise from "../../../../../lib/mongodb";
import { buildUserInsertDefaults } from "../../../../../lib/userSchema/userDefaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPrimaryEmail(data: any): string | null {
  const emails = Array.isArray(data?.email_addresses) ? data.email_addresses : [];
  const primaryId = data?.primary_email_address_id;
  return (
    emails.find((e: any) => e?.id === primaryId)?.email_address ??
    emails[0]?.email_address ??
    null
  );
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });

  const payload = await req.text();

  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  let evt: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const users = db.collection("users");

  const { type, data } = evt;

  if (type === "user.created" || type === "user.updated") {
    const clerkUserId = (data as any)?.id;
    if (!clerkUserId) return new Response("Missing user id", { status: 400 });

    const email = getPrimaryEmail(data);
    const clerkFirstName = (data as any)?.first_name ?? null;
    const clerkLastName = (data as any)?.last_name ?? null;
    const imageUrl = (data as any)?.image_url ?? null;
    const clerkCreatedAt = (data as any)?.created_at ?? null;

    await users.updateOne(
      { clerkUserId },
      {
        // write clerk as ONE object (no clerk.email, etc.)
        $set: {
          clerk: {
            email,
            firstName: clerkFirstName,
            lastName: clerkLastName,
            imageUrl,
            createdAt: clerkCreatedAt,
          },
          isDeleted: false,
          updatedAt: new Date(),
        },

        // insert defaults WITHOUT clerk
        $setOnInsert: buildUserInsertDefaults({ clerkUserId }),
      },
      { upsert: true }
    );

    return Response.json({ ok: true });
  }

  if (type === "user.deleted") {
    const clerkUserId = (data as any)?.id;
    if (clerkUserId) {
      await users.updateOne(
        { clerkUserId },
        { $set: { isDeleted: true, deletedAt: new Date(), updatedAt: new Date() } }
      );
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true, ignored: type });
}
