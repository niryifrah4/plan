import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/gcal/disconnect — remove Google Calendar tokens
 */
export async function POST() {
  const cookieStore = cookies();
  cookieStore.delete("gcal_access_token");
  cookieStore.delete("gcal_refresh_token");
  cookieStore.delete("gcal_connected");

  return NextResponse.json({ disconnected: true });
}
