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
  // optimistic concurrency: הגרסה שהלקוח חושב שקיימת. חסר = התנהגות
  // legacy (דריסה), כדי שלקוחות ישנים ימשיכו לעבוד בזמן פריסה הדרגתית.
  expectedVersion: z.number().int().nonnegative().optional(),
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
  const { key, householdId, value, expectedVersion } = parsed.data;

  // Defense in depth: לא לסמוך רק על RLS — לוודא שהמשתמש שייך/מייעץ
  // ל-household הזה לפני כתיבה.
  const allowed = await assertHouseholdAccess(sb, user.id, householdId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // כתיבה אטומית עם בקרת גרסה. ה-RPC מחזיר conflict=true אם השרת כבר
  // מחזיק גרסה חדשה יותר מזו שהלקוח עבד עליה.
  const { data, error } = await sb.rpc("upsert_client_state", {
    p_household: householdId,
    p_key: key,
    p_value: (value ?? null) as never,
    p_expected: expectedVersion ?? null,
  });

  if (error) {
    // Fallback בטוח לפריסה הדרגתית: אם ה-migration (0023) עוד לא רץ וה-RPC
    // לא קיים — נופלים לחזרה ל-upsert הישן כדי לא לאבד שמירות. PGRST202 =
    // function not found ב-PostgREST; 42883 = undefined_function ב-Postgres.
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") {
      const { error: upErr } = await sb
        .from("client_state")
        .upsert(
          { household_id: householdId, state_key: key, state_value: (value ?? null) as never },
          { onConflict: "household_id,state_key" }
        );
      if (upErr) {
        return NextResponse.json(
          { ok: false, error: "upsert_failed", detail: upErr.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, version: null });
    }
    return NextResponse.json(
      { ok: false, error: "upsert_failed", detail: error.message },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.out_conflict) {
    // 409 — הלקוח צריך למשוך את serverValue/serverVersion ולמזג.
    return NextResponse.json(
      {
        ok: false,
        error: "version_conflict",
        serverVersion: row.out_version,
        serverValue: row.out_value,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, version: row?.out_version ?? null });
}
