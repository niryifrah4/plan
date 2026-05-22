/**
 * (client) group — client-facing pages (dashboard, onboarding, budget, …).
 *
 * RSC guard (runs on every request):
 *   • No user                                → /login
 *   • User is an advisor without impersonation cookie → /crm
 *   • User is an advisor WITH valid impersonation cookie
 *                                           → allow, show IMPERSONATION banner
 *   • User is a client, household.stage=onboarding, not already on /onboarding
 *                                           → /onboarding
 *   • User has neither role row yet          → /auth/callback
 *
 * Demo mode (no Supabase env) skips the guard entirely.
 */

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import ClientLayoutInner from "./ClientLayoutInner";

const IMPERSONATE_COOKIE = "plan_impersonate_hh";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Dev bypass — same triple-guard as middleware. Treats the layout as if
  // Supabase isn't configured so the auth-required redirects below are skipped.
  // Production is unaffected: NODE_ENV !== 'development' there.
  const devBypass =
    process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "1";
  const isConfigured = !!url && !url.includes("YOUR-PROJECT") && !devBypass;

  let impersonation: { householdId: string; familyName: string } | null = null;

  if (isConfigured) {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) redirect("/login");

    const { data: advisor } = await sb
      .from("advisors")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (advisor) {
      // Advisor — require impersonation cookie to view client pages.
      const impHhId = cookies().get(IMPERSONATE_COOKIE)?.value;
      if (!impHhId) redirect("/crm");

      const { data: owned } = await sb
        .from("households")
        .select("id, family_name")
        .eq("id", impHhId)
        .eq("advisor_id", user.id)
        .maybeSingle();
      if (!owned) redirect("/crm");

      impersonation = { householdId: owned.id, familyName: owned.family_name };
    } else {
      // Client — enforce onboarding-stage gate.
      const { data: client } = await sb
        .from("client_users")
        .select("household_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!client) redirect("/auth/callback");

      const { data: household } = await sb
        .from("households")
        .select("stage")
        .eq("id", client.household_id)
        .maybeSingle();

      const path = headers().get("x-pathname") || headers().get("x-invoke-path") || "";
      const onOnboarding = path.startsWith("/onboarding");

      // 2026-05-22 per Nir: restore onboarding redirect for FRESH households.
      // A new client who hasn't completed onboarding lands on an empty dashboard
      // (13 sidebar items + zero data) and doesn't know to click "אפיון לקוח".
      // We funnel them to /onboarding once; after they finish, household.stage
      // flips out of 'onboarding' and they get the dashboard like everyone else.
      // Advisors are unaffected (handled in the impersonation branch above).
      if (household?.stage === "onboarding" && !onOnboarding) {
        redirect("/onboarding");
      }
    }
  }

  return <ClientLayoutInner impersonation={impersonation}>{children}</ClientLayoutInner>;
}
