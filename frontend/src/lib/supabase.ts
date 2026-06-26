import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client (singleton).
 * Ported from lib/supabase/browser.ts. Uses Vite env vars (VITE_*) instead
 * of NEXT_PUBLIC_*. Persists the session in localStorage so the access token
 * survives reloads — that token is what we forward to the backend as a Bearer.
 */
let _client: SupabaseClient | null = null;

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export function getSupabase(): SupabaseClient | null {
  if (!URL || !KEY || URL.includes("YOUR-PROJECT")) return null;
  if (!_client) {
    _client = createSupabaseClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return !!URL && !URL.includes("YOUR-PROJECT");
}

// Aliases for compatibility with reused app/ components
export const getSupabaseBrowser = getSupabase;
export const createClient = getSupabase;

