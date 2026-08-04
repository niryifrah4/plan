"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 * Used in Client Components for reactive queries + subscriptions.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  );
}
