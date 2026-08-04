import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Per-request Supabase client authenticated as the calling user.
 *
 * Architectural note (Next.js -> Vite+Node migration):
 *   The old app used @supabase/ssr with cookies() to build a server client
 *   that respected RLS. In the SPA + API split there are no shared cookies,
 *   so the browser sends the Supabase access token as a Bearer header and we
 *   forward it here. Passing the token via the global Authorization header
 *   makes RLS evaluate exactly as the authenticated advisor — same guarantees
 *   as the old createServerClient(), just token- instead of cookie-sourced.
 */
export function createUserClient(accessToken: string): SupabaseClient<any> {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client — bypasses RLS. Use ONLY for trusted admin operations
 * that previously used lib/supabase/admin.ts. Never expose to user input
 * without explicit authorization checks first.
 */
let _admin: SupabaseClient<any> | null = null;
export function createAdminClient(): SupabaseClient<any> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing — admin client unavailable");
  }
  if (!_admin) {
    _admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
