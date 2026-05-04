/**
 * ═══════════════════════════════════════════════════════════
 *  Blob Sync — generic key/value JSON sync for any store
 * ═══════════════════════════════════════════════════════════
 *
 * Stores whose shape doesn't map cleanly to a typed DB table (yet) can sync
 * through `client_state` — a per-household (key, jsonb value) table.
 *
 * Usage:
 *   pushBlob("debt_data", data)       // fire-and-forget
 *   const data = await pullBlob("debt_data")  // returns null if missing / offline
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { getHouseholdId } from "./remote-sync";

export async function pullBlob<T = any>(key: string): Promise<T | null> {
  if (!isSupabaseConfigured()) return null;
  const hh = getHouseholdId();
  if (!hh) return null;
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("client_state")
      .select("state_value")
      .eq("household_id", hh)
      .eq("state_key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data.state_value as T) ?? null;
  } catch {
    return null;
  }
}

export async function pushBlob<T = any>(key: string, value: T): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const hh = getHouseholdId();
  if (!hh) return false;
  const sb = getSupabaseBrowser();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from("client_state")
      .upsert(
        { household_id: hh, state_key: key, state_value: value as any },
        { onConflict: "household_id,state_key" }
      );
    if (error) {
      console.warn(`[blob-sync:${key}] upsert error:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[blob-sync:${key}] threw:`, e);
    return false;
  }
}

export function pushBlobInBackground<T = any>(key: string, value: T) {
  void pushBlob(key, value);
}

/**
 * Wipe ALL blob rows for the current household. Called from manualFactoryReset
 * so that hydration after the reload doesn't pull old state back in.
 *
 * 2026-04-29 per security audit: previously a reset only wiped localStorage;
 * the bootstrap then re-pulled the same data from Supabase and the user
 * thought the reset failed (e.g. "the Haifa property is still there").
 */
export async function wipeAllBlobsForHousehold(): Promise<{ deleted: number }> {
  if (!isSupabaseConfigured()) return { deleted: 0 };
  const hh = getHouseholdId();
  if (!hh) return { deleted: 0 };
  const sb = getSupabaseBrowser();
  if (!sb) return { deleted: 0 };
  try {
    const { count, error } = await sb
      .from("client_state")
      .delete({ count: "exact" })
      .eq("household_id", hh);
    if (error) {
      console.warn("[blob-sync] wipe failed:", error.message);
      return { deleted: 0 };
    }
    return { deleted: count || 0 };
  } catch (e) {
    console.warn("[blob-sync] wipe threw:", e);
    return { deleted: 0 };
  }
}
