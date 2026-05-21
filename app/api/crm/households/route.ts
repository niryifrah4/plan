/**
 * POST /api/crm/households
 *
 * Creates a household owned by the calling advisor. Used by the
 * "המר ללקוח" flow in /crm — when an advisor converts a lead, we
 * need a real DB row (so impersonation/RLS work) rather than a
 * local-only client object that's invisible to the server.
 *
 * Body: { familyName: string; membersCount?: number }
 * Returns: { ok: true, household: { id, family_name, members_count, stage, created_at } }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: advisor } = await sb
    .from("advisors")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor) return NextResponse.json({ error: "not_advisor" }, { status: 403 });

  let body: { familyName?: string; membersCount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const familyName = (body.familyName || "").trim();
  if (!familyName) return NextResponse.json({ error: "missing_family_name" }, { status: 400 });

  const rawMembers = body.membersCount;
  const membersCount =
    typeof rawMembers === "number" && Number.isFinite(rawMembers) && rawMembers > 0
      ? Math.min(20, Math.floor(rawMembers))
      : 2;

  const { data: created, error } = await sb
    .from("households")
    .insert({
      advisor_id: user.id,
      family_name: familyName,
      members_count: membersCount,
      stage: "onboarding",
      signup_source: "lead_conversion",
    })
    .select("id, family_name, members_count, stage, created_at")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: "household_create_failed", detail: error?.message ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, household: created });
}
