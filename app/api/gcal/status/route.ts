import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/gcal/status — check if Google Calendar is connected
 */
export async function GET() {
  const cookieStore = cookies();
  const connected = cookieStore.get("gcal_connected")?.value === "true";
  const hasToken = !!cookieStore.get("gcal_access_token")?.value;

  return NextResponse.json({
    connected: connected && hasToken,
    hasRefreshToken: !!cookieStore.get("gcal_refresh_token")?.value,
  });
}
