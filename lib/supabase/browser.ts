import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client (singleton).
 * Used in "use client" components for real-time CRUD.
 * Returns null if env vars are missing (localStorage fallback mode).
 */
let _client: SupabaseClient<any> | null = null;

const browserEnv = (key: string): string | undefined => {
  const viteValue = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key];
  if (viteValue) return viteValue;
  const runtimeValue = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  return runtimeValue;
};

export function getSupabaseBrowser() {
  const url = browserEnv("VITE_SUPABASE_URL") || browserEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = browserEnv("VITE_SUPABASE_ANON_KEY") || browserEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key || url.includes("YOUR-PROJECT")) return null;

  if (!_client) {
    _client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return _client;
}

/** Quick check: is Supabase actually configured? */
export function isSupabaseConfigured(): boolean {
  const url = browserEnv("VITE_SUPABASE_URL") || browserEnv("NEXT_PUBLIC_SUPABASE_URL");
  return !!url && !url.includes("YOUR-PROJECT");
}
