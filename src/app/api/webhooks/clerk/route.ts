import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import clientPromise from "../../../../../lib/mongodb";

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

/**
 * Infer the current onboarding step from unsafeMetadata.
 * Returns the NEXT step the user needs to complete.
 */
function inferStep(meta: Record<string, any>): string {
  if (meta.onboardingComplete === true) return "complete";
  if (Array.isArray(meta.photos) && meta.photos.length >= 2) return "complete";
  if (meta.about)                                              return "photos";
  if (Array.isArray(meta.interests) && meta.interests.length) return "about";
  if (meta.gender)                                            return "interests";
  if (meta.dob)                                               return "gender";
  if (meta.username)                                          return "dateOfBirth";
  return "username";
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });

  const payload = await req.text();

  const svix_id        = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  let evt: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      "svix-id":        svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const client = await clientPromise;
  const db     = client.db("assis_auth");
  const users  = db.collection("users");

  const { type, data } = evt;

  if (type === "user.created" || type === "user.updated") {
    const clerkUserId = (data as any)?.id;
    if (!clerkUserId) return new Response("Missing user id", { status: 400 });

    const email        = getPrimaryEmail(data);
    const firstName    = (data as any)?.first_name  ?? null;
    const lastName     = (data as any)?.last_name   ?? null;
    const imageUrl     = (data as any)?.image_url   ?? null;
    const clerkCreatedAt = (data as any)?.created_at ?? null;

    // Clerk sends unsafeMetadata as snake_case in webhook payload
    const meta: Record<string, any> = (data as any)?.unsafe_metadata ?? {};

    const step      = inferStep(meta);
    const completed = step === "complete";

    // Build profile fields from unsafeMetadata — only set fields that exist
    const profileFields: Record<string, any> = {
      "profile.email": email,
    };
    if (meta.username)                                          profileFields["profile.username"]  = meta.username;
    if (meta.dob)                                               profileFields["profile.dob"]       = meta.dob;
    if (typeof meta.age === "number")                           profileFields["profile.age"]       = meta.age;
    if (meta.gender)                                            profileFields["profile.gender"]    = meta.gender;
    if (Array.isArray(meta.interests) && meta.interests.length) profileFields["profile.interests"] = meta.interests;
    if (meta.about)                                             profileFields["profile.about"]     = meta.about;
    if (Array.isArray(meta.photos) && meta.photos.length)       profileFields["profile.photos"]    = meta.photos;

    await users.updateOne(
      { clerkUserId },
      {
        $set: {
          ...profileFields,
          clerk: { email, firstName, lastName, imageUrl, createdAt: clerkCreatedAt },
          "onboarding.step":      step,
          "onboarding.completed": completed,
          isDeleted:  false,
          updatedAt:  new Date(),
        },
        $setOnInsert: {
          clerkUserId,
          createdAt:  new Date(),
          deletedAt:  null,
        },
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
