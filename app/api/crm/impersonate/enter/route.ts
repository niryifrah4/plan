/**
 * Atomic impersonate-and-redirect endpoint.
 *
 * Why this exists (2026-05-28):
 *   The POST /api/crm/impersonate flow used by the CRM list was:
 *     1. fetch POST → server sets cookie via Set-Cookie header
 *     2. await fetch — client expects cookie is now committed
 *     3. window.location.href = "/dashboard" — triggers navigation
 *     4. browser fetches /dashboard with the new cookie
 *
 *   In practice this races. Some browsers/network conditions process
 *   the Set-Cookie header out of order with the subsequent navigation,
 *   so step 4 fires with the OLD cookie value. The dashboard layout
 *   then resolves the wrong tenant — the "click yifrah, see beser" bug.
 *
 * Fix: a single GET request that does cookie-set + 303 redirect in one
 * HTTP response. The browser commits Set-Cookie and follows Location
 * atomically. No client-side ordering to get wrong.
 *
 *   GET /api/crm/impersonate/enter?household_id=<UUID>
 *     → sets plan_impersonate_hh cookie
 *     → 303 redirect to /dashboard
 *
 * Validates advisor ownership server-side, same as the POST endpoint.
 *
 * The CRM "כניסה לתיק" button now navigates straight to this URL
 * instead of doing POST-then-navigate.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COOKIE = "plan_impersonate_hh";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

// Belt-and-suspenders: Next.js already treats this route as dynamic
// because it reads cookies/headers, but Render's CDN occasionally caches
// 3xx responses for the same URL across users. force-dynamic + zero
// revalidate makes that impossible.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const householdId = req.nextUrl.searchParams.get("household_id")?.trim() || "";
  const fwdProto = req.headers.get("x-forwarded-proto") || "https";
  const fwdHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const publicOrigin =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (fwdHost ? `${fwdProto}://${fwdHost}` : new URL(req.url).origin);
  // Server-side diagnostic. Visible in Render logs. Helps localize where
  // 'click yifrah, see beser' breaks if it ever surfaces again.
  // eslint-disable-next-line no-console
  console.info(
    `[impersonate/enter] requested household_id=${householdId.slice(0, 8) || "<empty>"}`
  );
  if (!householdId) {
    return new NextResponse("missing household_id", { status: 400 });
  }

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    // Bounce to login with redirect-back so the click resumes after auth.
    const loginUrl = new URL("/login", publicOrigin);
    loginUrl.searchParams.set(
      "redirect",
      `/api/crm/impersonate/enter?household_id=${encodeURIComponent(householdId)}`
    );
    return NextResponse.redirect(loginUrl);
  }

  const { data: advisor } = await sb
    .from("advisors")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor) {
    return NextResponse.redirect(new URL("/dashboard", publicOrigin));
  }

  const { data: owned } = await sb
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("advisor_id", user.id)
    .maybeSingle();
  if (!owned) {
    // eslint-disable-next-line no-console
    console.warn(
      `[impersonate/enter] household ${householdId.slice(0, 8)} NOT owned by user ${user.id.slice(0, 8)} → bouncing to /crm`
    );
    // Caller asked for a household this advisor doesn't own. Bounce back
    // to the CRM with a query flag so the UI can show a toast.
    const crmUrl = new URL("/crm", publicOrigin);
    crmUrl.searchParams.set("err", "not_owned");
    return NextResponse.redirect(crmUrl);
  }

  // eslint-disable-next-line no-console
  console.info(
    `[impersonate/enter] OK — setting cookie=${householdId.slice(0, 8)} for user=${user.id.slice(0, 8)} → redirect /dashboard`
  );

  // Atomic: same response carries Set-Cookie + 303 Location → browser
  // commits cookie and follows redirect with no possibility of race.
  const res = NextResponse.redirect(new URL("/dashboard", publicOrigin), 303);
  res.cookies.set(COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  // Defensive: never let this response be cached by Render / Next / CDN.
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
