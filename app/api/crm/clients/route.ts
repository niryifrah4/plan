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
  const sb = await createClient();
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
    if (h.signup_source === "self_signup" && linked === 0) return false;
    return true;
  });

  const householdIds = visible.map((h) => h.id);

  // Fetch net worth and doc counts in parallel.
  const [netWorthRes, docHistoryRes] = await Promise.all([
    sb.from("v_net_worth").select("household_id, net_worth").in("household_id", householdIds),
    sb
      .from("client_state")
      .select("household_id, state_value")
      .eq("state_key", "doc_history")
      .in("household_id", householdIds),
  ]);

  const netWorthMap = Object.fromEntries(
    (netWorthRes.data ?? []).map((r) => [r.household_id, r.net_worth as number])
  );
  type DocEntry = { filename: string; uploadedAt: string; bankHint?: string };
  const docDataMap = Object.fromEntries(
    (docHistoryRes.data ?? []).map((r) => {
      const arr = Array.isArray(r.state_value) ? (r.state_value as DocEntry[]) : [];
      return [r.household_id, arr];
    })
  );

  const cleaned = visible.map(({ client_users, ...rest }) => {
    void client_users;
    const docs = docDataMap[rest.id] ?? [];
    return {
      ...rest,
      net_worth: netWorthMap[rest.id] ?? null,
      docs_uploaded: docs.length,
      docs_list: docs.map((d: DocEntry) => ({ filename: d.filename, uploadedAt: d.uploadedAt, bankHint: d.bankHint ?? null })),
    };
  });

  return NextResponse.json({ households: cleaned });
}
