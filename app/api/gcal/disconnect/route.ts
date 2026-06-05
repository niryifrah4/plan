import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";

/**
 * POST /api/gcal/disconnect — remove Google Calendar tokens
 */
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const cookieStore = cookies();
  cookieStore.delete("gcal_access_token");
  cookieStore.delete("gcal_refresh_token");
  cookieStore.delete("gcal_connected");

  return NextResponse.json({ disconnected: true });
}
