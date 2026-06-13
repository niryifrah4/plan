/**
 * ═══════════════════════════════════════════════════════════
 *  Hidden merchants — Layer 2: system catalog store
 * ═══════════════════════════════════════════════════════════
 *
 * Global default-hide catalog. Cached in localStorage for synchronous reads in
 * the queue-classification path, refreshed from `hidden_merchants_catalog`.
 * Writes are advisor-only (enforced by RLS).
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { reportError } from "@/lib/report-error";
import { hiddenMerchantKey, mergeAlias } from "./normalize";
import type { HiddenCatalogMerchant } from "./types";

const STORAGE_KEY = "verdant:hidden_merchants_catalog";
export const HIDDEN_CATALOG_EVENT = "verdant:hidden_merchants_catalog:updated";

export function loadHiddenCatalog(): HiddenCatalogMerchant[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(items: HiddenCatalogMerchant[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(HIDDEN_CATALOG_EVENT));
  } catch (e) {
    reportError("hidden-merchants/catalog-store", e);
  }
}

export async function hydrateHiddenCatalogFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return false;
    const { data, error } = await sb
      .from("hidden_merchants_catalog")
      .select("normalized_key, aliases, is_hidden, label");
    if (error || !data) return false;
    const mapped: HiddenCatalogMerchant[] = data.map((r) => ({
      normalizedKey: r.normalized_key,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      isHidden: r.is_hidden ?? true,
      label: r.label || r.normalized_key,
    }));
    writeCache(mapped);
    return true;
  } catch (e) {
    reportError("hidden-merchants/catalog-store:hydrate", e);
    return false;
  }
}

export async function upsertHiddenCatalogMerchant(
  description: string,
  isHidden = true
): Promise<HiddenCatalogMerchant[]> {
  const key = hiddenMerchantKey(description);
  if (!key) return loadHiddenCatalog();
  const current = loadHiddenCatalog();
  const existing = current.find((m) => m.normalizedKey === key);
  const entry: HiddenCatalogMerchant = {
    normalizedKey: key,
    aliases: mergeAlias(existing?.aliases ?? [], description),
    isHidden,
    label: existing?.label || description.trim() || key,
  };
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseBrowser();
      if (sb) {
        const { data: auth } = await sb.auth.getUser();
        await sb.from("hidden_merchants_catalog").upsert(
          {
            normalized_key: entry.normalizedKey,
            aliases: entry.aliases,
            is_hidden: entry.isHidden,
            label: entry.label,
            updated_by: auth?.user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "normalized_key" }
        );
      }
    } catch (e) {
      reportError("hidden-merchants/catalog-store:upsert", e);
    }
  }
  const list = [entry, ...current.filter((m) => m.normalizedKey !== key)];
  writeCache(list);
  return list;
}

export async function removeHiddenCatalogMerchant(
  normalizedKey: string
): Promise<HiddenCatalogMerchant[]> {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseBrowser();
      if (sb)
        await sb.from("hidden_merchants_catalog").delete().eq("normalized_key", normalizedKey);
    } catch (e) {
      reportError("hidden-merchants/catalog-store:remove", e);
    }
  }
  const list = loadHiddenCatalog().filter((m) => m.normalizedKey !== normalizedKey);
  writeCache(list);
  return list;
}
