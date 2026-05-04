/**
 * POST /api/crm/clients/[id]/stage
 * Updates the household stage (e.g. "onboarding" → "active") so the CRM
 * dashboard reflects that the client finished the questionnaire.
 *
 * Auth: Supabase session required. The RLS policy on `households` already
 * gates by ownership (advisor or client_user). We additionally constrain
 * the update by household id from the path.
 *
 * Per Nir 2026-04-27: previously there was no "I'm done" event — advisors
 * had no way to know a client finished. This endpoint provides that signal.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_STAGES = new Set(["onboarding", "active", "review", "archived"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const householdId = params.id;
  if (!householdId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  let body: { stage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const stage = String(body?.stage || "");
  if (!ALLOWED_STAGES.has(stage)) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }

  // RLS does the auth check on the household row — we just narrow by id.
  const { error } = await supabase.from("households").update({ stage }).eq("id", householdId);

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stage });
}
