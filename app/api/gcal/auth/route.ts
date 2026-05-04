import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

/**
 * GET /api/gcal/auth
 * Redirects the user to Google's OAuth consent screen.
 * If credentials aren't set, redirects back to CRM with friendly error.
 */
export async function GET(req: NextRequest) {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch {
    // No credentials configured — redirect back with error param
    return NextResponse.redirect(new URL("/crm?gcal=error&reason=not_configured", req.url));
  }
}
