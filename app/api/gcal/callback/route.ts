import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-calendar";
import { cookies } from "next/headers";

/**
 * GET /api/gcal/callback?code=...
 * Google redirects here after consent. Exchanges code for tokens.
 * Stores tokens in HTTP-only cookies (secure, server-side).
 * In production, store in Supabase advisor_settings table instead.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/crm?gcal=error&reason=no_code", req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const cookieStore = cookies();

    // Store tokens securely in HTTP-only cookies
    if (tokens.access_token) {
      cookieStore.set("gcal_access_token", tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60, // 1 hour (access token lifetime)
        path: "/",
      });
    }

    if (tokens.refresh_token) {
      cookieStore.set("gcal_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      });
    }

    // Mark as connected
    cookieStore.set("gcal_connected", "true", {
      httpOnly: false, // readable by client JS
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });

    return NextResponse.redirect(new URL("/crm?gcal=connected", req.url));
  } catch (e: any) {
    console.error("[gcal/callback] Token exchange failed:", e);
    return NextResponse.redirect(new URL(`/crm?gcal=error&reason=${encodeURIComponent(e.message)}`, req.url));
  }
}
