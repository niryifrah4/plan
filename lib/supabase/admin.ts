import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES RLS.
 * ONLY use in server-only code for system operations (cron, admin tasks).
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("admin_client_server_only");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_missing");
  }
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
