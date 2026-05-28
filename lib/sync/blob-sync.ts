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

/**
 * Pull all blobs for the current household whose key starts with `prefix`.
 * Returns a map of state_key → state_value. Empty object when nothing matches
 * or Supabase is unavailable.
 *
 * Used by stores that namespace many keys (e.g. `budget_YYYY_MM`) and need
 * to rehydrate all of them on tenant switch.
 */
export async function pullBlobsByPrefix(prefix: string): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured()) return {};
  const hh = getHouseholdId();
  if (!hh) return {};
  const sb = getSupabaseBrowser();
  if (!sb) return {};
  try {
    const { data, error } = await sb
      .from("client_state")
      .select("state_key, state_value")
      .eq("household_id", hh)
      .like("state_key", `${prefix}%`);
    if (error || !data) return {};
    const out: Record<string, unknown> = {};
    for (const row of data as Array<{ state_key: string; state_value: unknown }>) {
      out[row.state_key] = row.state_value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Push a blob to Supabase, scoped to a household.
 *
 * **CRITICAL — push-race protection (2026-05-27):** the second parameter
 * `householdIdOverride` MUST be passed by every caller. It locks the write
 * to the household that was active **at the moment of save**, not at the
 * moment the async push resolves.
 *
 * Without this, the following sequence corrupted Supabase:
 *   1. advisor edits client A's data — write hits localStorage immediately
 *   2. saveX fires `pushBlobInBackground` (async)
 *   3. advisor switches to client B before step 2 resolves
 *   4. wipeForTenantSwitch sets active_household_id = B
 *   5. step 2 finally executes — reads getHouseholdId() = B → writes A's
 *      data to B's client_state row. NOW client B's view shows A's data.
 *
 * Always call sites: capture `getHouseholdId()` *synchronously* in the same
 * function that called the save, then pass it as the third arg.
 */
export async function pushBlob<T = any>(
  key: string,
  value: T,
  householdIdOverride?: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const hh = householdIdOverride ?? getHouseholdId();
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

export function pushBlobInBackground<T = any>(
  key: string,
  value: T,
  householdIdOverride?: string | null
) {
  // Snapshot the household synchronously when no override given so the
  // async push can't pick up a post-switch UUID.
  const hh = householdIdOverride ?? getHouseholdId();
  void pushBlob(key, value, hh);
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
