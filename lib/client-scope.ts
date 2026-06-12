import { reportError } from "@/lib/report-error";
/**
 * Per-client storage namespace.
 * Every financial store routes reads/writes through scopedKey() so
 * data is isolated per active client (verdant:current_hh).
 *
 * Global keys (registry, session, etc.) are NOT scoped — see UNSCOPED_KEYS.
 */

export const CURRENT_HH_KEY = "verdant:current_hh";
export const CLIENTS_REGISTRY_KEY = "verdant:clients";
export const ACTIVE_CLIENT_CHANGED = "verdant:active_client:changed";

/** Set when an advisor impersonates a client household. Written by
 *  ClientLayoutInner whenever the impersonation cookie resolves. */
const ACTIVE_HOUSEHOLD_UUID_KEY = "verdant:active_household_id";

/** Keys that remain global (never scoped). */
const UNSCOPED_KEYS = new Set<string>([
  CURRENT_HH_KEY,
  CLIENTS_REGISTRY_KEY,
  ACTIVE_HOUSEHOLD_UUID_KEY,
  "verdant:last_activity",
]);

export function getActiveClientId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT_HH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Read the impersonated household's UUID (set by ClientLayoutInner).
 *  Returns null when no advisor session is impersonating. */
function getImpersonationUuid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(ACTIVE_HOUSEHOLD_UUID_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Convert a base key (e.g. "verdant:pension_funds") to a client-scoped key.
 *
 * Scoping precedence (2026-05-25 — impersonation UUID wins):
 *   1. UNSCOPED_KEYS — return baseKey verbatim
 *   2. SSR — return baseKey (no localStorage to scope to)
 *   3. **Impersonation UUID present — ALWAYS wins.** `verdant:c:hh-<uuid8>:<sub>`.
 *      An advisor impersonating any household must see isolated data,
 *      regardless of stale current_hh values from a single-tenant past.
 *   4. Numeric current_hh present — `verdant:c:<id>:<sub>` (legacy single-
 *      advisor-many-clients-via-registry flow that pre-dated impersonation).
 *   5. Pre-migration single-tenant fallback — return baseKey only when there
 *      is genuinely NO active session at all.
 *
 * **Critical lesson learned 2026-05-25:** the previous order (current_hh
 * first) leaked data across households. If Nir's browser still had
 * `verdant:current_hh = "1"` from when he was the system's only user, every
 * household he later impersonated saw the same `verdant:c:1:*` scope and
 * read each other's data. Putting the impersonation UUID first guarantees
 * isolation even if current_hh is stale.
 */
export function scopedKey(baseKey: string): string {
  if (UNSCOPED_KEYS.has(baseKey)) return baseKey;
  if (typeof window === "undefined") return baseKey; // SSR safe
  const sub = baseKey.startsWith("verdant:") ? baseKey.slice("verdant:".length) : baseKey;
  const uuid = getImpersonationUuid();
  if (uuid) return `verdant:c:hh-${uuid.replace(/-/g, "").slice(0, 12)}:${sub}`;
  const id = getActiveClientId();
  if (id != null) return `verdant:c:${id}:${sub}`;
  return baseKey; // pre-migration single-tenant fallback
}

/**
 * Switch the active client. Writes current_hh and dispatches events so
 * every store/page listener rehydrates from the new namespace.
 */
export function setActiveClientId(id: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENT_HH_KEY, String(id));
  } catch (e) { reportError("client-scope", e); }
  dispatchAllRefreshEvents();
}

/**
 * Purge legacy localStorage keys that pre-date UUID-based scoping.
 *
 * Why: before the impersonation flow existed, scopedKey() used a numeric
 * `verdant:current_hh` and stores wrote under `verdant:c:<number>:*`.
 * When Nir was the only user, that number was almost always "1". Once
 * multiple households entered the system, every household ALIASED to the
 * same legacy `verdant:c:1:*` namespace and saw each other's data.
 *
 * The current scopedKey() ignores those legacy paths (it uses
 * `verdant:c:hh-<uuid8>:*` when impersonation is active), so the data
 * sitting under `verdant:c:<number>:*` is invisible to reads — UNTIL a
 * code path falls back through the precedence chain and finds it.
 *
 * This purge guarantees the legacy paths are gone for good. Safe to call
 * any time: it never touches UUID-scoped paths (which are the source of
 * truth in the new world) or the global keys in UNSCOPED_KEYS.
 *
 * Returns the number of keys removed (for logging / debugging).
 */
export function purgeLegacyScopedKeys(): number {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Match `verdant:c:<digits>:*` only. `verdant:c:hh-<uuid>:*` is the
      // current-era namespace and stays untouched.
      if (/^verdant:c:\d+:/.test(k)) {
        keysToDelete.push(k);
      }
    }
    for (const k of keysToDelete) {
      localStorage.removeItem(k);
      removed++;
    }
  } catch (e) { reportError("client-scope", e); }
  return removed;
}

/**
 * Keys preserved across a tenant switch. Everything else under `verdant:*`
 * is wiped so the next bootstrap re-hydrates clean from Supabase.
 *
 * - `verdant:clients`            — CRM's local snapshot of the household
 *                                  list. Re-fetched from Supabase when the
 *                                  user navigates back to /crm.
 * - `verdant:factory_reset_version` — keeps runFactoryResetIfNeeded from
 *                                  firing another full wipe on the next mount.
 * - `verdant:last_activity`      — session-watcher idle timestamp.
 *
 * `verdant:active_household_id` is intentionally NOT preserved — the caller
 * MUST re-plant it post-wipe with the new tenant's UUID.
 */
const TENANT_SWITCH_PRESERVE = new Set<string>([
  CLIENTS_REGISTRY_KEY,
  "verdant:factory_reset_version",
  "verdant:last_activity",
]);

/**
 * Wipe every `verdant:*` localStorage key from the previous tenant, then
 * re-plant the new tenant's `active_household_id`.
 *
 * Why this is needed: `hydrate*FromRemote` functions across the stores
 * (debt-store, accounts-store, onboarding-remote, etc.) silently return
 * `false` when the remote blob/table is empty for the active household —
 * they don't clear the existing local cache. Combined with legacy unscoped
 * writes (`verdant:debt_data`, `verdant:onboarding:children` written before
 * scopedKey() existed), this caused a data leak where freshly-impersonated
 * household בסר saw the previous household יפרח's mortgage, kids, etc.
 *
 * The only correct architecture is: on tenant switch, nuke local, let
 * bootstrap pull authoritative data per the new tenant's Supabase rows.
 *
 * Pass `null` for `newHouseholdUuid` when exiting impersonation (back to
 * the advisor's own dashboard) — the function will still wipe local data
 * but won't re-plant the UUID pointer.
 *
 * Returns the number of keys removed.
 */
export function wipeForTenantSwitch(newHouseholdUuid: string | null): number {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  try {
    const preserved: Record<string, string> = {};
    for (const k of TENANT_SWITCH_PRESERVE) {
      try {
        const v = localStorage.getItem(k);
        if (v != null) preserved[k] = v;
      } catch (e) { reportError("client-scope", e); }
    }
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("verdant:")) toDelete.push(k);
    }
    for (const k of toDelete) {
      try {
        localStorage.removeItem(k);
        removed++;
      } catch (e) { reportError("client-scope", e); }
    }
    for (const [k, v] of Object.entries(preserved)) {
      try {
        localStorage.setItem(k, v);
      } catch (e) { reportError("client-scope", e); }
    }
    if (newHouseholdUuid) {
      try {
        localStorage.setItem(ACTIVE_HOUSEHOLD_UUID_KEY, newHouseholdUuid);
      } catch (e) { reportError("client-scope", e); }
    }
  } catch (e) { reportError("client-scope", e); }
  return removed;
}

/** Fires every known store event so pages re-read from new namespace. */
export function dispatchAllRefreshEvents(): void {
  if (typeof window === "undefined") return;
  const events = [
    ACTIVE_CLIENT_CHANGED,
    "verdant:accounts:updated",
    "verdant:pension:updated",
    "verdant:realestate:updated",
    "verdant:debt:updated",
    "verdant:budgets:updated",
    "verdant:buckets:updated",
    "verdant:balance_history:updated",
    "verdant:assumptions",
    "verdant:scenarios:updated",
    "verdant:goals:updated",
    "verdant:risk:updated",
    "verdant:securities:updated",
    "verdant:parsed_transactions:updated",
    "verdant:insights:updated",
    "verdant:kids_savings:updated",
    "verdant:investments:updated",
  ];
  events.forEach((name) => window.dispatchEvent(new Event(name)));
}

/**
 * Store refresh events only.
 *
 * Use this after remote hydration so pages re-read their data without
 * pretending the active client/household changed.
 */
export function dispatchStoreRefreshEvents(): void {
  if (typeof window === "undefined") return;
  const events = [
    "verdant:accounts:updated",
    "verdant:pension:updated",
    "verdant:realestate:updated",
    "verdant:debt:updated",
    "verdant:budgets:updated",
    "verdant:buckets:updated",
    "verdant:balance_history:updated",
    "verdant:assumptions",
    "verdant:scenarios:updated",
    "verdant:goals:updated",
    "verdant:risk:updated",
    "verdant:securities:updated",
    "verdant:parsed_transactions:updated",
    "verdant:insights:updated",
    "verdant:kids_savings:updated",
    "verdant:salary_profile:updated",
    "verdant:docs:updated",
    "verdant:portfolio:updated",
    "verdant:special-events:updated",
    "verdant:subscriptions_radar_exclusions:updated",
  ];
  events.forEach((name) => window.dispatchEvent(new Event(name)));
}
