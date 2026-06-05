import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";

/**
 * GET /api/gcal/status — check if Google Calendar is connected
 */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const cookieStore = cookies();
  const connected = cookieStore.get("gcal_connected")?.value === "true";
  const hasToken = !!cookieStore.get("gcal_access_token")?.value;

  return NextResponse.json({
    connected: connected && hasToken,
    hasRefreshToken: !!cookieStore.get("gcal_refresh_token")?.value,
  });
}
