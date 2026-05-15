// // src/app/api/profile/route.ts
// import { NextResponse } from "next/server";
// import clientPromise from "../../../../lib/mongodb";

// function normalizePhotoUrls(raw: any): string[] {
//   if (!Array.isArray(raw)) return [];
//   const out: string[] = [];
//   for (const p of raw) {
//     if (typeof p === "string" && p.trim()) out.push(p.trim());
//     else if (p && typeof p === "object" && typeof (p as any).url === "string" && (p as any).url.trim()) {
//       out.push(String((p as any).url).trim());
//     }
//   }
//   return out;
// }

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// function requireApiKey(req: Request) {
//   const apiKeyHeader = req.headers.get("x-api-key") || "";
//   const API_KEY = process.env.EVENT_API_KEY;
//   return !API_KEY || apiKeyHeader !== API_KEY
//     ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
//     : null;
// }

// function getUsersCollection() {
//   return clientPromise.then((client) => {
//     const db = client.db("assis_auth");
//     const users = db.collection("users");
//     return { db, users };
//   });
// }

// export async function GET(req: Request) {
//   try {
//     const auth = requireApiKey(req);
//     if (auth) return auth;

//     if (!process.env.MONGODB_URI) {
//       console.error("GET /api/profile failed: Missing MONGODB_URI");
//       return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
//     }

//     const { searchParams } = new URL(req.url);
//     const clerkUserId = String(searchParams.get("clerkUserId") || "").trim();
//     if (!clerkUserId) {
//       return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
//     }

//     const { users } = await getUsersCollection();

//     // Keep "never 404": create an empty doc if missing (doesn't touch onboarding)
//     await users.updateOne(
//       { clerkUserId },
//       {
//         $setOnInsert: {
//           clerkUserId,
//           profile: {
//             firstName: null,
//             lastName: null,
//             about: null,
//             gender: null,
//             age: null,
//             interests: [],
//             photos: [],
//             location: null,
//           },
//           onboarding: { completed: false, step: "name" },
//           createdAt: new Date(),
//           deletedAt: null,
//           isDeleted: false,
//         },
//         $set: { updatedAt: new Date() },
//       },
//       { upsert: true }
//     );

//     const doc = await users.findOne(
//       { clerkUserId, isDeleted: { $ne: true } },
//       { projection: { _id: 0, clerkUserId: 1, profile: 1, clerk: 1, onboarding: 1 } }
//     );

//     const safeDoc: any = doc ?? {};
//     const p: any = safeDoc.profile ?? {};
//     const c: any = safeDoc.clerk ?? {};

//     const firstName = String(p.firstName ?? c.firstName ?? "").trim();
//     const lastName = String(p.lastName ?? c.lastName ?? "").trim();
//     const name = `${firstName} ${lastName}`.trim();

//     return NextResponse.json(
//       {
//         clerkUserId,
//         name: name || "Your Name",
//         username: typeof p.username === "string" ? p.username : "", // keep if you’re using it
//         about: typeof p.about === "string" ? p.about : "",
//         interests: Array.isArray(p.interests) ? p.interests : [],
//         languages: Array.isArray(p.languages) ? p.languages : [], // keep if you’re using it
//         photos: normalizePhotoUrls(p.photos),
//         avatar: p.avatar?.url || null,
//         onboarding: safeDoc.onboarding ?? null,
//       },
//       { status: 200, headers: { "Cache-Control": "no-store" } }
//     );
//   } catch (e: any) {
//     console.error("GET /api/profile failed:", {
//       message: e?.message,
//       name: e?.name,
//       stack: e?.stack,
//     });
//     return NextResponse.json(
//       {
//         error: "Internal Server Error",
//         detail: typeof e?.message === "string" ? e.message : "",
//       },
//       { status: 500 }
//     );
//   }
// }

// export async function PATCH(req: Request) {
//   const auth = requireApiKey(req);
//   if (auth) return auth;

//   try {
//     const body = await req.json().catch(() => null);
//     if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

//     const clerkUserId = String(body.clerkUserId || "").trim();
//     if (!clerkUserId) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });

//     const patch: Record<string, any> = {};

//     if ("about" in body) {
//       const about = String(body.about ?? "").trim();
//       patch["profile.about"] = about.slice(0, 500);
//     }

//     if ("interests" in body) {
//       const raw = body.interests;
//       if (!Array.isArray(raw)) {
//         return NextResponse.json({ error: "interests must be an array" }, { status: 400 });
//       }
//       const interests = Array.from(
//         new Set(
//           raw
//             .map((x: any) => String(x ?? "").trim())
//             .filter((x: string) => x.length > 0)
//         )
//       ).slice(0, 20);
//       patch["profile.interests"] = interests;
//     }

//     if ("languages" in body) {
//       const raw = body.languages;
//       if (!Array.isArray(raw)) {
//         return NextResponse.json({ error: "languages must be an array" }, { status: 400 });
//       }
//       const languages = Array.from(
//         new Set(
//           raw
//             .map((x: any) => String(x ?? "").trim())
//             .filter((x: string) => x.length > 0)
//         )
//       ).slice(0, 20);
//       patch["profile.languages"] = languages;
//     }

//     if (Object.keys(patch).length === 0) {
//       return NextResponse.json({ error: "No fields to update" }, { status: 400 });
//     }

//     const { users, db } = await getUsersCollection();

//     await users.updateOne(
//       { clerkUserId },
//       {
//         $set: { ...patch, updatedAt: new Date() },
//         $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
//       },
//       { upsert: true }
//     );

//     return NextResponse.json({ ok: true, db: db.databaseName });
//   } catch (e: any) {
//     console.error("PATCH /api/profile failed:", e);
//     return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
//   }
// }








// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

function normalizePhotoUrls(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const p of raw) {
    if (typeof p === "string" && p.trim()) out.push(p.trim());
    else if (p && typeof p === "object" && typeof (p as any).url === "string" && (p as any).url.trim()) {
      out.push(String((p as any).url).trim());
    }
  }
  return out;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireApiKey(req: Request) {
  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const API_KEY = process.env.EVENT_API_KEY;
  return !API_KEY || apiKeyHeader !== API_KEY
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : null;
}

function getUsersCollection() {
  return clientPromise.then((client) => {
    const db = client.db("assis_auth");
    const users = db.collection("users");
    return { db, users };
  });
}

export async function GET(req: Request) {
  try {
    const auth = requireApiKey(req);
    if (auth) return auth;

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const clerkUserId = String(searchParams.get("clerkUserId") || "").trim();
    if (!clerkUserId) {
      return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });
    }
    const { db, users } = await getUsersCollection();

    const doc = await users.findOne(
      { clerkUserId, isDeleted: { $ne: true } },
      { projection: { _id: 0, clerkUserId: 1, profile: 1, clerk: 1, onboarding: 1 } }
    );
    
    // Fetch user stats from separate collection
    const stats = await db.collection("user_stats").findOne({ clerkUserId });

    const safeDoc: any = doc ?? {};
    const p: any = safeDoc.profile ?? {};
    const c: any = safeDoc.clerk ?? {};

    const firstName = String(p.firstName ?? c.firstName ?? "").trim();
    const lastName = String(p.lastName ?? c.lastName ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();

    return NextResponse.json(
      {
        clerkUserId,
        name: name || "Your Name",
        username: typeof p.username === "string" ? p.username : "",
        email: p.email || c.email || "",
        about: typeof p.about === "string" ? p.about : "",
        interests: Array.isArray(p.interests) ? p.interests : [],
        languages: Array.isArray(p.languages) ? p.languages : [],
        photos: normalizePhotoUrls(p.photos),
        avatar: typeof p.avatar === "string" ? p.avatar : (p.avatar?.url || null),
        gender: p.gender || "",
        city: p.city || p.location?.city || "",
        country: p.country || p.location?.country || "",
        phone: p.phone || "",
        dateOfBirth: p.dateOfBirth || null,
        isPrivate: !!p.isPrivate,
        // ✅ Stats from user_stats collection
        rating: stats?.rating ?? 0,
        eventsHosted: stats?.eventsHosted ?? 0,
        totalAttendees: stats?.totalAttendees ?? 0,
        repeatedAttendees: stats?.repeatedAttendees ?? 0,
        newAttendees: stats?.newAttendees ?? 0,
        reviewsCount: stats?.reviewsCount ?? 0,
        // ✅ Earnings (in paise, frontend converts to ₹)
        thisMonthEarning: stats?.thisMonthEarning ?? 0,
        overallEarning: stats?.overallEarning ?? 0,
        // ✅ Services (titles of service-kind events)
        services: Array.isArray(stats?.services) ? stats.services : [],
        isVerified: !!safeDoc.verification?.idVerified,
        onboarding: safeDoc.onboarding ?? null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal Server Error", detail: typeof e?.message === "string" ? e.message : "" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const clerkUserId = String(body.clerkUserId || "").trim();
    if (!clerkUserId) return NextResponse.json({ error: "clerkUserId is required" }, { status: 400 });

    const patch: Record<string, any> = {};

    // ✅ Name support
    if ("name" in body) {
      const name = String(body.name ?? "").trim();
      const parts = name.split(" ").filter(Boolean);
      patch["profile.firstName"] = parts[0] ?? "";
      patch["profile.lastName"] = parts.slice(1).join(" ") ?? "";
    }

    // ✅ Username support with uniqueness check
    if ("username" in body) {
      const username = String(body.username ?? "").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
      if (username.length < 3) {
        return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
      }
      const { users } = await getUsersCollection();
      const existing = await users.findOne({
        "profile.username": username,
        clerkUserId: { $ne: clerkUserId },
      });
      if (existing) {
        return NextResponse.json({ error: "Username already taken, try another" }, { status: 409 });
      }
      patch["profile.username"] = username;
    }

    if ("firstName" in body) patch["profile.firstName"] = String(body.firstName ?? "").trim();
    if ("lastName" in body)  patch["profile.lastName"]  = String(body.lastName  ?? "").trim();
    if ("phone" in body)     patch["profile.phone"]     = String(body.phone     ?? "").trim();
    if ("gender" in body)    patch["profile.gender"]    = String(body.gender    ?? "").trim();
    if ("city" in body)      patch["profile.city"]      = String(body.city      ?? "").trim();
    if ("country" in body)   patch["profile.country"]   = String(body.country   ?? "").trim();
    if ("isPrivate" in body) patch["profile.isPrivate"] = !!body.isPrivate;

    if ("about" in body) {
      const about = String(body.about ?? "").trim();
      patch["profile.about"] = about.slice(0, 500);
    }

    if ("interests" in body) {
      const raw = body.interests;
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: "interests must be an array" }, { status: 400 });
      }
      const interests = Array.from(
        new Set(raw.map((x: any) => String(x ?? "").trim()).filter((x: string) => x.length > 0))
      ).slice(0, 20);
      patch["profile.interests"] = interests;
    }

    if ("languages" in body) {
      const raw = body.languages;
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: "languages must be an array" }, { status: 400 });
      }
      const languages = Array.from(
        new Set(raw.map((x: any) => String(x ?? "").trim()).filter((x: string) => x.length > 0))
      ).slice(0, 20);
      patch["profile.languages"] = languages;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { users, db } = await getUsersCollection();

    await users.updateOne(
      { clerkUserId },
      {
        $set: { ...patch, updatedAt: new Date() },
        $setOnInsert: { clerkUserId, createdAt: new Date(), deletedAt: null, isDeleted: false },
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, db: db.databaseName });
  } catch (e: any) {
    console.error("PATCH /api/profile failed:", e);
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}