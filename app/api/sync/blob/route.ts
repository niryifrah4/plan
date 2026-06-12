import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { assertHouseholdAccess } from "@/lib/api/household-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const BodySchema = z.object({
  key: z.string().trim().min(1).max(200),
  householdId: z.string().uuid(),
  // value יכול להיות כל JSON; null מותר (מחיקה לוגית).
  value: z.unknown().optional(),
});

export async function POST(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(req, BodySchema);
  if (!parsed.ok) return parsed.res;
  const { key, householdId, value } = parsed.data;

  // Defense in depth: לא לסמוך רק על RLS — לוודא שהמשתמש שייך/מייעץ
  // ל-household הזה לפני כתיבה.
  const allowed = await assertHouseholdAccess(sb, user.id, householdId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error } = await sb
    .from("client_state")
    .upsert(
      {
        household_id: householdId,
        state_key: key,
        state_value: (value ?? null) as never,
      },
      { onConflict: "household_id,state_key" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: "upsert_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
