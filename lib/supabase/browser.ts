import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client (singleton).
 * Used in "use client" components for real-time CRUD.
 * Returns null if env vars are missing (localStorage fallback mode).
 */
let _client: SupabaseClient<any> | null = null;

export function getSupabaseBrowser() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT")) return null;

  if (!_client) {
    _client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return _client;
}

/** Quick check: is Supabase actually configured? */
export function isSupabaseConfigured(): boolean {
  const url = process.env.VITE_SUPABASE_URL;
  return !!url && !url.includes("YOUR-PROJECT");
}
