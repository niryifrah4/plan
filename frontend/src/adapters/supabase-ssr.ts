// Shim for @supabase/ssr (not installed in the SPA). The reused root
// lib/supabase/*.ts import createBrowserClient/createServerClient from it;
// back them with @supabase/supabase-js, which is what the Vite singleton
// already uses. Browser-only, so cookie handling is a no-op.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createBrowserClient(url: string, key: string): SupabaseClient<any> {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export function createServerClient(url: string, key: string): SupabaseClient<any> {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
