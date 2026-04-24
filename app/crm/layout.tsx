/**
 * /crm — advisor-only area.
 *
 * RSC guard: if the current user isn't in the advisors table, we bounce
 * them through /auth/callback which routes by role (clients → /dashboard
 * or /onboarding; no user → /login).
 *
 * Demo mode (no Supabase env) skips the guard so the local UI still works.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured = !!url && !url.includes("YOUR-PROJECT");

  if (isConfigured) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect("/login");

    const { data: advisor } = await sb
      .from("advisors")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    // Not an advisor → smart router decides where to send them.
    if (!advisor) redirect("/auth/callback");
  }

  return <>{children}</>;
}
