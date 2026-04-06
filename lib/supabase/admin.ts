import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES RLS.
 * ONLY use in server-only code for system operations (cron, admin tasks).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
