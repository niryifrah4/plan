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
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";

const BodySchema = z.object({
  familyName: z.string().trim().min(1).max(200),
  membersCount: z.number().int().positive().max(20).optional(),
});

export async function POST(req: NextRequest) {
  const sb = await createClient();
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

  const parsed = await parseBody(req, BodySchema);
  if (!parsed.ok) return parsed.res;

  const familyName = parsed.data.familyName.trim();
  const membersCount = parsed.data.membersCount ?? 2;

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
