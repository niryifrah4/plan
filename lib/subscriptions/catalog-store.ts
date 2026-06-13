/**
 * ═══════════════════════════════════════════════════════════
 *  Subscriptions — Layer 2: system catalog store
 * ═══════════════════════════════════════════════════════════
 *
 * The catalog is global (not per-household). It is cached in localStorage so
 * the transaction-classification path can read it synchronously, and refreshed
 * from `subscription_merchants` on boot. Writes are advisor-only and enforced
 * by RLS on the table.
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { reportError } from "@/lib/report-error";
import { subscriptionKey, mergeAlias } from "./normalize";
import type { CatalogMerchant } from "./types";

// Global (not scoped per household) — the catalog is the same for everyone.
const STORAGE_KEY = "verdant:subscription_catalog";
export const SUBSCRIPTION_CATALOG_EVENT = "verdant:subscription_catalog:updated";

export function loadSubscriptionCatalog(): CatalogMerchant[] {
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

function writeCache(items: CatalogMerchant[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(SUBSCRIPTION_CATALOG_EVENT));
  } catch (e) {
    reportError("subscriptions/catalog-store", e);
  }
}

export async function hydrateCatalogFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return false;
    const { data, error } = await sb
      .from("subscription_merchants")
      .select("normalized_key, aliases, is_subscription, label");
    if (error || !data) return false;
    const mapped: CatalogMerchant[] = data.map((r) => ({
      normalizedKey: r.normalized_key,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      isSubscription: r.is_subscription ?? true,
      label: r.label || r.normalized_key,
    }));
    writeCache(mapped);
    return true;
  } catch (e) {
    reportError("subscriptions/catalog-store:hydrate", e);
    return false;
  }
}

/** Advisor-only: add or update a catalog merchant (RLS enforces the role). */
export async function upsertCatalogMerchant(
  description: string,
  isSubscription = true
): Promise<CatalogMerchant[]> {
  const key = subscriptionKey(description);
  if (!key) return loadSubscriptionCatalog();
  const current = loadSubscriptionCatalog();
  const existing = current.find((m) => m.normalizedKey === key);
  const aliases = mergeAlias(existing?.aliases ?? [], description);
  const entry: CatalogMerchant = {
    normalizedKey: key,
    aliases,
    isSubscription,
    label: existing?.label || description.trim() || key,
  };
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseBrowser();
      if (sb) {
      const { data: auth } = await sb.auth.getUser();
      await sb.from("subscription_merchants").upsert(
        {
          normalized_key: entry.normalizedKey,
          aliases: entry.aliases,
          is_subscription: entry.isSubscription,
          label: entry.label,
          updated_by: auth?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "normalized_key" }
      );
      }
    } catch (e) {
      reportError("subscriptions/catalog-store:upsert", e);
    }
  }
  const list = [entry, ...current.filter((m) => m.normalizedKey !== key)];
  writeCache(list);
  return list;
}

/** Advisor-only: remove a catalog merchant. */
export async function removeCatalogMerchant(normalizedKey: string): Promise<CatalogMerchant[]> {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseBrowser();
      if (sb) await sb.from("subscription_merchants").delete().eq("normalized_key", normalizedKey);
    } catch (e) {
      reportError("subscriptions/catalog-store:remove", e);
    }
  }
  const list = loadSubscriptionCatalog().filter((m) => m.normalizedKey !== normalizedKey);
  writeCache(list);
  return list;
}
