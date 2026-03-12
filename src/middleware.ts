// middleware.ts
// ✅ Updated: Razorpay webhook route public add kiya

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,DELETE,PATCH,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-api-key, x-clerk-user-id, ngrok-skip-browser-warning",
  "Access-Control-Allow-Credentials": "true",
};

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
  "/api/webhooks/razorpay(.*)",   // ✅ NEW — Razorpay webhook public hona chahiye
  "/api/onboarding/name(.*)",
  "/api/onboarding/interests(.*)",
  "/api/onboarding/about(.*)",
  "/api/onboarding/photos(.*)",
  "/api/onboarding/gender(.*)",
  "/api/onboarding/dateOfBirth(.*)",
  "/api/payment/create-order(.*)", // ✅ Payment routes bhi public (apna x-api-key auth use karte hain)
  "/api/payment/verify(.*)",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
  const res = NextResponse.next();
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
});

export default function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }
  return (clerkHandler as any)(req);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).)",
    "/(api|trpc)(.*)",
  ],
};