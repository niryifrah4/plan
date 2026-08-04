// Type/resolution shim for @supabase/ssr — the package isn't a backend
// dependency, but the shared root lib/supabase/browser.ts (client-only) gets
// pulled into the type graph. Backed by @supabase/supabase-js, which the
// backend already depends on. Not used at runtime on the server.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createBrowserClient(url: string, key: string): SupabaseClient<any> {
  return createClient(url, key);
}

export function createServerClient(url: string, key: string): SupabaseClient<any> {
  return createClient(url, key);
}
