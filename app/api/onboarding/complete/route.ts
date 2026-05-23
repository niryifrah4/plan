/**
 * POST /api/onboarding/complete
 *
 * Called from the onboarding "סיים" button. Flips the caller's household
 * stage from 'onboarding' → 'active' so the (client) layout stops redirecting
 * them back to /onboarding on the next page load.
 *
 * Auth: any signed-in client_user. Each user is mapped to exactly one
 * household via client_users. RLS on `households` ensures the UPDATE only
 * affects rows the user actually owns.
 *
 * Built 2026-05-22 — pairs with the onboarding-stage redirect added to
 * the (client) layout the same day.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve caller's household via client_users. Advisors don't have a row
  // here — they get 404, which is correct (advisors don't complete their own
  // onboarding; they flip stage via /api/crm/clients/[id]/stage).
  const { data: client } = await supabase
    .from("client_users")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "not_a_client" }, { status: 404 });
  }

  const { error } = await supabase
    .from("households")
    .update({ stage: "active" })
    .eq("id", client.household_id);

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
