import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const IMPERSONATE_COOKIE = "plan_impersonate_hh";

/**
 * /plan is the advisor's working canvas — assigning tasks, drafting
 * recommendations during a session. Self-serve B2C clients have no use
 * for it, so we redirect them away rather than expose CRM affordances.
 *
 * Allowed:  advisor + valid impersonation cookie  → render /plan
 * Blocked:  client / advisor without impersonation → /dashboard
 */
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isConfigured = !!url && !url.includes("YOUR-PROJECT");

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

    const impHhId = cookies().get(IMPERSONATE_COOKIE)?.value;
    if (!advisor || !impHhId) redirect("/dashboard");
  }

  return <>{children}</>;
}
