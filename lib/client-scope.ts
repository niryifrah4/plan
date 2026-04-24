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

/** Keys that remain global (never scoped). */
const UNSCOPED_KEYS = new Set<string>([
  CURRENT_HH_KEY,
  CLIENTS_REGISTRY_KEY,
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

/** Convert a base key (e.g. "verdant:pension_funds") to a client-scoped key. */
export function scopedKey(baseKey: string): string {
  if (UNSCOPED_KEYS.has(baseKey)) return baseKey;
  if (typeof window === "undefined") return baseKey; // SSR safe
  const id = getActiveClientId();
  if (id == null) return baseKey; // pre-migration fallback
  const sub = baseKey.startsWith("verdant:") ? baseKey.slice("verdant:".length) : baseKey;
  return `verdant:c:${id}:${sub}`;
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
