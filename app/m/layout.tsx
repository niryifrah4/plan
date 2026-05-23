/**
 * /m — mobile shell (PWA-first).
 *
 * Server component: resolves which household belongs to the logged-in
 * user (advisor → their auto-created household; client → the one their
 * client_users row points to) and passes the id down to MobileBootstrap.
 *
 * MobileBootstrap (client-side) then writes `verdant:active_household_id`
 * to localStorage and triggers `bootstrapSessionOnce()` — exactly the
 * same dance ClientLayoutInner does on the desktop. Without this dance
 * the mobile mounts with an empty cache and silently shows zero data.
 *
 * Auth itself is enforced by middleware.ts in production. In local dev
 * the middleware bypasses /m so we can iterate UI without re-logging in.
 */

import { createClient } from "@/lib/supabase/server";
import { MobileBootstrap } from "./MobileBootstrap";

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured = !!url && !url.includes("YOUR-PROJECT");

  let householdId: string | null = null;

  if (isConfigured) {
    try {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (user) {
        // Advisor route: pick the advisor's own auto-created household.
        const { data: advisor } = await sb
          .from("advisors")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (advisor) {
          const { data: hh } = await sb
            .from("households")
            .select("id")
            .eq("advisor_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (hh?.id) householdId = hh.id;
        } else {
          // Client route: resolve the household via client_users.
          const { data: client } = await sb
            .from("client_users")
            .select("household_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (client?.household_id) householdId = client.household_id;
        }
      }
    } catch {
      /* fall through with householdId = null — the UI will render the
         offline / empty state and bootstrap retries on next visit */
    }
  }

  return (
    <MobileBootstrap householdId={householdId}>
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: 480,
          minHeight: "100vh",
          background: "var(--morning-bg)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </div>
    </MobileBootstrap>
  );
}
