import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";
import { randomBytes } from "crypto";

/**
 * GET /api/gcal/auth
 * Redirects the user to Google's OAuth consent screen.
 * If credentials aren't set, redirects back to CRM with friendly error.
 */
export async function GET(req: NextRequest) {
  const publicOrigin =
    process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

  try {
    const state = randomBytes(16).toString("base64url");
    const url = getAuthUrl(state);
    const res = NextResponse.redirect(url);
    res.cookies.set("gcal_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    });
    return res;
  } catch {
    // No credentials configured — redirect back with error param
    return NextResponse.redirect(
      new URL("/crm?gcal=error&reason=not_configured", publicOrigin)
    );
  }
}
