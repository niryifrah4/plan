/**
 * GET /api/crm/clients
 *
 * Returns the advisor's real client households from Supabase.
 * Used by /crm to populate the "לקוחות פעילים" tab with real data.
 *
 * Filters out orphaned self-signup households:
 *   The auth trigger creates a household under the system advisor (Nir)
 *   whenever ANY user signs up without an invite_token. When that user
 *   later gets deleted (e.g. cleanup after an E2E test), the household
 *   remains attached to Nir with zero linked client_users — that's
 *   "ghost clients" cluttering the CRM. We hide those here.
 *
 *   manual_invite / admin_signup / lead_conversion are always shown
 *   (those are intentional creations by the advisor — never auto-generated
 *   by an external signup, so they're never orphaned in a meaningful way).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Pull households with a count of linked client_users so we can drop
  // orphaned self-signups in a single round-trip.
  const { data: households, error } = await sb
    .from("households")
    .select("id, family_name, members_count, stage, created_at, signup_source, client_users(count)")
    .eq("advisor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    family_name: string;
    members_count: number;
    stage: string;
    created_at: string;
    signup_source: string;
    client_users: { count: number }[];
  };

  const rows = (households || []) as Row[];
  const visible = rows.filter((h) => {
    const linked = h.client_users?.[0]?.count ?? 0;
    // Hide orphaned self-signups (zero linked users — the human who
    // triggered the signup no longer exists).
    if (h.signup_source === "self_signup" && linked === 0) return false;
    return true;
  });

  // Strip the count helper before returning so the client doesn't see it.
  const cleaned = visible.map(({ client_users, ...rest }) => {
    void client_users;
    return rest;
  });

  return NextResponse.json({ households: cleaned });
}
