/**
 * Advisor impersonation — view a client's screens as the client sees them.
 *
 * POST /api/crm/impersonate  body: { householdId }
 *   Verifies the caller is an advisor who owns the target household,
 *   then sets the `plan_impersonate_hh` cookie (httpOnly, 8h).
 *
 * DELETE /api/crm/impersonate
 *   Clears the impersonation cookie.
 *
 * The (client) RSC layout reads this cookie to decide whether an advisor
 * is allowed through (normally advisors are bounced to /crm).
 *
 * No RLS changes needed — advisors already own their households' data
 * via `hh_advisor_rw`. The cookie is purely a frontend routing signal.
 *
 * SECURITY (defense-in-depth):
 *   Cookie value is unsigned (just householdId), BUT app/(client)/layout.tsx
 *   re-verifies `households.advisor_id = auth.uid()` on every RSC render, so
 *   a stolen/copied cookie cannot be abused by another advisor — the DB
 *   check rejects it. Any NEW consumer of this cookie outside the layout
 *   MUST perform the same ownership check before trusting the value.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COOKIE = "plan_impersonate_hh";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export async function POST(req: NextRequest) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: advisor } = await sb.from("advisors").select("id").eq("id", user.id).maybeSingle();
  if (!advisor) return NextResponse.json({ error: "not_advisor" }, { status: 403 });

  let body: { householdId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const householdId = (body.householdId || "").trim();
  if (!householdId) return NextResponse.json({ error: "missing_household_id" }, { status: 400 });

  const { data: owned } = await sb
    .from("households")
    .select("id, family_name")
    .eq("id", householdId)
    .eq("advisor_id", user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "household_not_owned" }, { status: 403 });

  const res = NextResponse.json({ ok: true, householdId, familyName: owned.family_name });
  res.cookies.set(COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
