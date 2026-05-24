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
 * Scoping precedence (2026-05-24 hardened):
 *   1. UNSCOPED_KEYS — return baseKey verbatim
 *   2. SSR — return baseKey (no localStorage to scope to)
 *   3. Numeric current_hh present — `verdant:c:<id>:<sub>` (legacy advisor flow)
 *   4. Impersonation UUID present — `verdant:c:hh-<uuid8>:<sub>`. **Critical**:
 *      this branch existed implicitly via current_hh, but if current_hh was
 *      cleared mid-switch (which ClientLayoutInner does on impersonation
 *      change) we'd silently fall to baseKey — leaking the previous tenant's
 *      data into the new household's view.
 *   5. Pre-migration single-tenant fallback — return baseKey only when there
 *      is genuinely NO active session at all (no current_hh AND no UUID).
 *      Once an advisor session is active, we never fall back to unscoped.
 */
export function scopedKey(baseKey: string): string {
  if (UNSCOPED_KEYS.has(baseKey)) return baseKey;
  if (typeof window === "undefined") return baseKey; // SSR safe
  const sub = baseKey.startsWith("verdant:") ? baseKey.slice("verdant:".length) : baseKey;
  const id = getActiveClientId();
  if (id != null) return `verdant:c:${id}:${sub}`;
  const uuid = getImpersonationUuid();
  if (uuid) return `verdant:c:hh-${uuid.replace(/-/g, "").slice(0, 12)}:${sub}`;
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
  } catch {}
  dispatchAllRefreshEvents();
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
  ];
  events.forEach((name) => window.dispatchEvent(new Event(name)));
}
