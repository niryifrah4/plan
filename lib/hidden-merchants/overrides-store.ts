/**
 * ═══════════════════════════════════════════════════════════
 *  Hidden merchants — Layer 1: per-client overrides store
 * ═══════════════════════════════════════════════════════════
 *
 * Same "localStorage-first, Supabase-best-effort" pattern as the subscriptions
 * overrides store. Persists to `hidden_merchant_overrides` (per household).
 */

import { scopedKey } from "@/lib/client-scope";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { getHouseholdId } from "@/lib/sync/remote-sync";
import { reportError } from "@/lib/report-error";
import { hiddenMerchantKey, mergeAlias } from "./normalize";
import type { HiddenDecision, HiddenOverride } from "./types";

const STORAGE_KEY = "verdant:hidden_merchant_overrides";
export const HIDDEN_OVERRIDES_EVENT = "verdant:hidden_merchant_overrides:updated";

export function loadHiddenOverrides(): HiddenOverride[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

function writeCache(items: HiddenOverride[]): void {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(items));
    window.dispatchEvent(new Event(HIDDEN_OVERRIDES_EVENT));
  } catch (e) {
    reportError("hidden-merchants/overrides-store", e);
  }
}

/** Record (or update) a client's hide/show decision for a merchant. */
export function setHiddenOverride(
  description: string,
  decision: HiddenDecision
): HiddenOverride[] {
  if (typeof window === "undefined") return [];
  const key = hiddenMerchantKey(description);
  if (!key) return loadHiddenOverrides();

  const current = loadHiddenOverrides();
  const existing = current.find((o) => o.normalizedKey === key);
  const next: HiddenOverride = {
    normalizedKey: key,
    aliases: mergeAlias(existing?.aliases ?? [], description),
    decision,
    label: existing?.label || description.trim() || key,
    updatedAt: new Date().toISOString(),
  };
  const list = [next, ...current.filter((o) => o.normalizedKey !== key)];
  writeCache(list);
  void pushToRemote(next);
  return list;
}

/** Remove a client's decision (back to default). */
export function clearHiddenOverride(normalizedKey: string): HiddenOverride[] {
  if (typeof window === "undefined") return [];
  const list = loadHiddenOverrides().filter((o) => o.normalizedKey !== normalizedKey);
  writeCache(list);
  void deleteFromRemote(normalizedKey);
  return list;
}

export async function hydrateHiddenOverridesFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isSupabaseConfigured()) return false;
  const hh = getHouseholdId();
  if (!hh) return false;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return false;
    const { data, error } = await sb
      .from("hidden_merchant_overrides")
      .select("normalized_key, aliases, decision, label, updated_at")
      .eq("household_id", hh);
    if (error || !data) return false;
    const mapped: HiddenOverride[] = data.map((r) => ({
      normalizedKey: r.normalized_key,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      decision: r.decision as HiddenDecision,
      label: r.label || r.normalized_key,
      updatedAt: r.updated_at || new Date().toISOString(),
    }));
    mapped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    writeCache(mapped);
    return true;
  } catch (e) {
    reportError("hidden-merchants/overrides-store:hydrate", e);
    return false;
  }
}

async function pushToRemote(item: HiddenOverride): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const hh = getHouseholdId();
  if (!hh) return;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data: auth } = await sb.auth.getUser();
    await sb.from("hidden_merchant_overrides").upsert(
      {
        household_id: hh,
        normalized_key: item.normalizedKey,
        aliases: item.aliases,
        decision: item.decision,
        label: item.label,
        updated_by: auth?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,normalized_key" }
    );
  } catch (e) {
    reportError("hidden-merchants/overrides-store:push", e);
  }
}

async function deleteFromRemote(normalizedKey: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const hh = getHouseholdId();
  if (!hh) return;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    await sb
      .from("hidden_merchant_overrides")
      .delete()
      .eq("household_id", hh)
      .eq("normalized_key", normalizedKey);
  } catch (e) {
    reportError("hidden-merchants/overrides-store:delete", e);
  }
}

function isValid(o: unknown): o is HiddenOverride {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.normalizedKey === "string" &&
    (r.decision === "hidden" || r.decision === "visible")
  );
}
