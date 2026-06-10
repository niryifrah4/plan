/**
 * Diagnostic endpoint for the 'click yifrah, see beser' bug.
 *
 * GET /api/crm/impersonate/debug
 *   → returns JSON showing:
 *       - currently-authenticated user_id
 *       - whether user is an advisor
 *       - raw value of the plan_impersonate_hh cookie
 *       - what (id, family_name) Supabase returns for that cookie value
 *         (using the SAME query the layout uses)
 *       - all households this advisor owns (so we can see if the cookie's
 *         value matches one of them)
 *
 * The user can hit this endpoint in the browser AFTER clicking a client in
 * the CRM. The JSON tells us in seconds whether the cookie was set, what
 * value it carries, and whether the Supabase lookup returns the expected
 * household — pinpointing exactly which layer of the impersonation flow is
 * misbehaving.
 *
 * Temporary debug surface — remove once the routing leak is fully closed.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const COOKIE = "plan_impersonate_hh";

export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE)?.value ?? null;

  const { data: advisor } = await sb
    .from("advisors")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  // What does the impersonation lookup return for the cookie's value?
  let cookieResolves: { id: string; family_name: string } | null = null;
  let cookieResolveError: string | null = null;
  if (cookieValue) {
    const { data, error } = await sb
      .from("households")
      .select("id, family_name")
      .eq("id", cookieValue)
      .eq("advisor_id", user.id)
      .maybeSingle();
    if (error) cookieResolveError = error.message;
    else cookieResolves = data;
  }

  // What households does this advisor own? (for comparison with cookie value)
  const { data: ownedHouseholds } = await sb
    .from("households")
    .select("id, family_name, created_at")
    .eq("advisor_id", user.id)
    .order("created_at", { ascending: false });

  const res = NextResponse.json(
    {
      ok: true,
      user_id: user.id,
      is_advisor: !!advisor,
      cookie: {
        name: COOKIE,
        value: cookieValue,
        present: !!cookieValue,
      },
      cookie_resolves_to: cookieResolves,
      cookie_resolve_error: cookieResolveError,
      owned_households: ownedHouseholds || [],
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
  // Never cache the diagnostic response — we want a live snapshot each call.
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
