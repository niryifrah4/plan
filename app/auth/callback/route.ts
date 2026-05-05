/**
 * OAuth callback — handles code exchange and smart post-login redirect.
 *
 * Flow:
 *   1. Supabase returns ?code=… after Google OAuth success.
 *   2. Exchange code for a session (sets cookies via the SSR client).
 *   3. Detect whether the user is an advisor or a client:
 *        advisor → /crm
 *        client without onboarding → /onboarding
 *        client with onboarding → /dashboard
 *
 * Also accepts an optional `redirect` param from the /login page so
 * deep-links survive the round-trip.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const redirectParam = searchParams.get("redirect");

  // 2026-05-01: behind a proxy (Render), `new URL(req.url).origin` returns
  // the internal `localhost:10000` instead of the public host. Use the
  // X-Forwarded-* headers Render sets, fall back to NEXT_PUBLIC_BASE_URL,
  // then to the parsed URL as last resort.
  const fwdProto = req.headers.get("x-forwarded-proto") || "https";
  const fwdHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const origin = fwdHost
    ? `${fwdProto}://${fwdHost}`
    : process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

  const sb = createClient();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  // If the login page passed an explicit redirect (e.g. /budget), honor it
  // when we can — but only for valid in-app paths.
  if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
    return NextResponse.redirect(`${origin}${redirectParam}`);
  }

  // ── Smart redirect by role ─────────────────────────────────
  const target = await resolveLandingPage(sb);
  return NextResponse.redirect(`${origin}${target}`);
}

/**
 * Decide where the freshly-authenticated user should land.
 * Exported so the /login page's post-password-signin flow can reuse it.
 */
async function resolveLandingPage(sb: ReturnType<typeof createClient>): Promise<string> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return "/login";

  // Advisor lookup
  const { data: advisor } = await sb.from("advisors").select("id").eq("id", user.id).maybeSingle();

  if (advisor) return "/crm";

  // Client lookup
  let { data: client } = await sb
    .from("client_users")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // If no role row yet, try to link via a pending invite matched by email.
  // This handles advisors who invite an email that already has an auth account
  // (the DB trigger only fires on CREATE, so we link on first login instead).
  if (!client && user.email) {
    const { data: invite } = await sb
      .from("client_invites")
      .select("token, household_id")
      .eq("email", user.email.toLowerCase())
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invite) {
      await sb.from("client_users").insert({
        user_id: user.id,
        household_id: invite.household_id,
        email: user.email,
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      });
      await sb
        .from("client_invites")
        .update({ consumed_at: new Date().toISOString() })
        .eq("token", invite.token);

      client = { household_id: invite.household_id };
    }
  }

  if (!client) {
    // Trigger may have failed or this is a brand-new user without
    // a role row yet. Send them to login with a retryable error.
    return "/login?error=missing_role";
  }

  // 2026-05-05 per Nir: post-login always lands on /dashboard. The
  // questionnaire is a one-time setup — it shouldn't be the front door
  // every time a returning couple opens the app. The empty dashboard
  // shows a "complete your profile" banner instead (see /dashboard).
  return "/dashboard";
}
