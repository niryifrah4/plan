/**
 * ═══════════════════════════════════════════════════════════
 *  Subscriptions — Layer 1: per-client overrides store
 * ═══════════════════════════════════════════════════════════
 *
 * "localStorage-first, Supabase-best-effort" — identical philosophy to the
 * rest of the app's stores. Reads serve instantly from a per-household
 * localStorage cache; writes update the cache, fire a refresh event, and push
 * to `subscription_overrides` in the background. On boot / household switch,
 * `hydrateOverridesFromRemote()` pulls the authoritative rows from the DB.
 */

import { scopedKey } from "@/lib/client-scope";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { getHouseholdId } from "@/lib/sync/remote-sync";
import { reportError } from "@/lib/report-error";
import { subscriptionKey, mergeAlias } from "./normalize";
import type { SubscriptionDecision, SubscriptionOverride } from "./types";

const STORAGE_KEY = "verdant:subscription_overrides";
export const SUBSCRIPTION_OVERRIDES_EVENT = "verdant:subscription_overrides:updated";

// ── Local cache ─────────────────────────────────────────────────────────────

export function loadSubscriptionOverrides(): SubscriptionOverride[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidOverride) : [];
  } catch {
    return [];
  }
}

function writeCache(items: SubscriptionOverride[]): void {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(items));
    window.dispatchEvent(new Event(SUBSCRIPTION_OVERRIDES_EVENT));
  } catch (e) {
    reportError("subscriptions/overrides-store", e);
  }
}

// ── Public mutations ────────────────────────────────────────────────────────

/**
 * Record (or update) a client's decision for the merchant behind `description`.
 * Returns the full, updated list. Pushes to the DB in the background.
 */
export function setSubscriptionOverride(
  description: string,
  decision: SubscriptionDecision,
  appliesToPast = true
): SubscriptionOverride[] {
  if (typeof window === "undefined") return [];
  const key = subscriptionKey(description);
  if (!key) return loadSubscriptionOverrides();

  const current = loadSubscriptionOverrides();
  const existing = current.find((o) => o.normalizedKey === key);
  const aliases = mergeAlias(existing?.aliases ?? [], description);
  const next: SubscriptionOverride = {
    normalizedKey: key,
    aliases,
    decision,
    label: existing?.label || description.trim() || key,
    appliesToPast,
    updatedAt: new Date().toISOString(),
  };
  const list = [next, ...current.filter((o) => o.normalizedKey !== key)];
  writeCache(list);
  void pushOverrideToRemote(next);
  return list;
}

/** Remove a client's decision entirely (the "undo" / back-to-default action). */
export function clearSubscriptionOverride(normalizedKey: string): SubscriptionOverride[] {
  if (typeof window === "undefined") return [];
  const list = loadSubscriptionOverrides().filter((o) => o.normalizedKey !== normalizedKey);
  writeCache(list);
  void deleteOverrideFromRemote(normalizedKey);
  return list;
}

// ── Remote sync ─────────────────────────────────────────────────────────────

export async function hydrateOverridesFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isSupabaseConfigured()) return false;
  const hh = getHouseholdId();
  if (!hh) return false;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return false;
    const { data, error } = await sb
      .from("subscription_overrides")
      .select("normalized_key, aliases, decision, label, applies_to_past, updated_at")
      .eq("household_id", hh);
    if (error || !data) return false;
    const mapped: SubscriptionOverride[] = data.map((r) => ({
      normalizedKey: r.normalized_key,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      decision: r.decision as SubscriptionDecision,
      label: r.label || r.normalized_key,
      appliesToPast: r.applies_to_past ?? true,
      updatedAt: r.updated_at || new Date().toISOString(),
    }));
    mapped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    writeCache(mapped);
    return true;
  } catch (e) {
    reportError("subscriptions/overrides-store:hydrate", e);
    return false;
  }
}

async function pushOverrideToRemote(item: SubscriptionOverride): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const hh = getHouseholdId();
  if (!hh) return;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data: auth } = await sb.auth.getUser();
    await sb.from("subscription_overrides").upsert(
      {
        household_id: hh,
        normalized_key: item.normalizedKey,
        aliases: item.aliases,
        decision: item.decision,
        label: item.label,
        applies_to_past: item.appliesToPast,
        updated_by: auth?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,normalized_key" }
    );
  } catch (e) {
    reportError("subscriptions/overrides-store:push", e);
  }
}

async function deleteOverrideFromRemote(normalizedKey: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const hh = getHouseholdId();
  if (!hh) return;
  try {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    await sb
      .from("subscription_overrides")
      .delete()
      .eq("household_id", hh)
      .eq("normalized_key", normalizedKey);
  } catch (e) {
    reportError("subscriptions/overrides-store:delete", e);
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

function isValidOverride(o: unknown): o is SubscriptionOverride {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.normalizedKey === "string" &&
    (r.decision === "subscription" || r.decision === "not_subscription")
  );
}
