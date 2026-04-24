/**
 * ═══════════════════════════════════════════════════════════
 *  Remote Sync — Generic Supabase ↔ localStorage bridge
 * ═══════════════════════════════════════════════════════════
 *
 * Pattern: "localStorage-first, Supabase-best-effort".
 * - All reads serve from localStorage immediately (sync, fast).
 * - On save, we write LS first (never loses), then push to Supabase in background.
 * - On app boot / household switch, we pull from Supabase and overwrite LS
 *   so the user sees fresh cross-device data.
 *
 * This lets every store keep its existing sync API (loadXxx / saveXxx) while
 * gaining real persistence. When Supabase is not configured, all calls no-op
 * and the app works exactly as before (demo mode).
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

/**
 * Get the currently active household ID (the "client" the planner is viewing).
 * For now, reads the localStorage client-scope value. When Supabase auth is
 * wired, the planner's UI can set this to a real household UUID from the DB.
 */
export function getHouseholdId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("verdant:active_household_id");
    if (raw && raw.trim()) return raw.trim();
  } catch {}
  return null;
}

export function setHouseholdId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem("verdant:active_household_id", id);
    else localStorage.removeItem("verdant:active_household_id");
  } catch {}
}

export interface SyncConfig<TLocal, TRow> {
  /** Supabase table name, e.g. "pension_products" */
  table: string;
  /** Convert local record → DB row (minus household_id/id which we manage) */
  toRow: (item: TLocal, householdId: string) => Partial<TRow>;
  /** Convert DB row → local record */
  fromRow: (row: TRow) => TLocal;
  /**
   * Unique conflict key(s) for upsert (comma-separated column list).
   * If omitted, uses plain insert (will duplicate on re-push).
   * Tables with a natural UNIQUE index should specify it.
   */
  onConflict?: string;
  /** Columns to select on pull (default "*") */
  select?: string;
}

/**
 * Pull all rows for the current household.
 * Returns null if Supabase unavailable (caller should fall back to LS).
 */
export async function pullFromRemote<TLocal, TRow = any>(
  cfg: SyncConfig<TLocal, TRow>,
): Promise<TLocal[] | null> {
  if (!isSupabaseConfigured()) return null;
  const hh = getHouseholdId();
  if (!hh) return null;
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(cfg.table)
      .select(cfg.select ?? "*")
      .eq("household_id", hh);
    if (error || !data) {
      if (error) console.warn(`[sync:${cfg.table}] pull error:`, error.message);
      return null;
    }
    return (data as TRow[]).map(cfg.fromRow);
  } catch (e) {
    console.warn(`[sync:${cfg.table}] pull threw:`, e);
    return null;
  }
}

/**
 * Push items to remote. "Replace" semantics: deletes existing rows for the
 * household, then inserts the new set. Keeps DB in sync with local truth.
 * Best-effort — errors are logged, never thrown.
 */
export async function pushToRemote<TLocal, TRow = any>(
  cfg: SyncConfig<TLocal, TRow>,
  items: TLocal[],
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "not-configured" };
  const hh = getHouseholdId();
  if (!hh) return { ok: false, error: "no-household" };
  const sb = getSupabaseBrowser();
  if (!sb) return { ok: false, error: "no-client" };
  try {
    // Delete-then-insert for simplicity. Alternative: upsert with onConflict.
    const { error: delErr } = await sb
      .from(cfg.table)
      .delete()
      .eq("household_id", hh);
    if (delErr) {
      console.warn(`[sync:${cfg.table}] delete error:`, delErr.message);
      return { ok: false, error: delErr.message };
    }
    if (items.length === 0) return { ok: true };
    const rows = items.map((item) => ({
      ...cfg.toRow(item, hh),
      household_id: hh,
    }));
    const { error: insErr } = await sb.from(cfg.table).insert(rows as any);
    if (insErr) {
      console.warn(`[sync:${cfg.table}] insert error:`, insErr.message);
      return { ok: false, error: insErr.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[sync:${cfg.table}] push threw:`, msg);
    return { ok: false, error: msg };
  }
}

/** Fire-and-forget wrapper for save paths that can't await. */
export function pushToRemoteInBackground<TLocal, TRow = any>(
  cfg: SyncConfig<TLocal, TRow>,
  items: TLocal[],
) {
  void pushToRemote(cfg, items);
}
