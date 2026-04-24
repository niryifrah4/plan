/**
 * GET /api/crm/clients
 *
 * Returns the advisor's real client households from Supabase.
 * Used by /crm to populate the "לקוחות פעילים" tab with real data.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: households, error } = await sb
    .from("households")
    .select("id, family_name, members_count, stage, created_at")
    .eq("advisor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ households: households || [] });
}
