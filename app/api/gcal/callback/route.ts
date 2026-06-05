import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-calendar";
import { cookies } from "next/headers";

const OAUTH_STATE_COOKIE = "gcal_oauth_state";

/**
 * GET /api/gcal/callback?code=...
 * Google redirects here after consent. Exchanges code for tokens.
 * Stores tokens in HTTP-only cookies (secure, server-side).
 * In production, store in Supabase advisor_settings table instead.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const publicOrigin =
    process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const cookieStore = cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value || null;

  // Clear the one-time state cookie regardless of outcome.
  cookieStore.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  if (!code) {
    return NextResponse.redirect(new URL("/crm?gcal=error&reason=no_code", publicOrigin));
  }

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/crm?gcal=error&reason=invalid_state", publicOrigin)
    );
  }

  try {
    const tokens = await exchangeCode(code);

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

    return NextResponse.redirect(new URL("/crm?gcal=connected", publicOrigin));
  } catch (e: any) {
    console.error("[gcal/callback] Token exchange failed:", e);
    return NextResponse.redirect(
      new URL(`/crm?gcal=error&reason=${encodeURIComponent(e.message)}`, publicOrigin)
    );
  }
}
