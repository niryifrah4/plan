import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (singleton).
 * Used in "use client" components for real-time CRUD.
 * Returns null if env vars are missing (localStorage fallback mode).
 */
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT")) return null;

  if (!_client) {
    _client = createBrowserClient(url, key);
  }
  return _client;
}

/** Quick check: is Supabase actually configured? */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && !url.includes("YOUR-PROJECT");
}
