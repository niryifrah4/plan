/**
 * Verdant Ledger · Cross-Page Sync Engine
 *
 * Event-driven data flow:
 *   Documents → Cashflow → Budget → Timeline / Goals
 *
 * Each data change fires a custom event on `window`.
 * Pages subscribe to the events they depend on.
 *
 * Flow:
 *   1. Document uploaded → doc-parser extracts → fires "verdant:docs:updated"
 *   2. Cashflow page listens → recalculates → fires "verdant:cashflow:updated"
 *   3. Budget page listens → adjusts allocations → fires "verdant:budget:updated"
 *   4. Vision/Timeline pages listen → recalculate goal progress
 */

export type SyncEvent =
  | "verdant:docs:updated"
  | "verdant:cashflow:updated"
  | "verdant:budgets:updated"
  | "verdant:debt:updated"
  | "verdant:goals:updated"
  | "verdant:assumptions"
  | "verdant:investments:updated"
  | "verdant:networth:updated"
  | "verdant:kids_savings:updated"
  | "verdant:special-events:updated";

/** Fire a sync event with optional detail payload. */
export function fireSync(event: SyncEvent, detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

/** Subscribe to a sync event. Returns unsubscribe function. */
export function onSync(
  event: SyncEvent,
  handler: (detail?: Record<string, unknown>) => void
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}

/**
 * Trigger the full cascade: docs → cashflow → budget → goals → networth.
 * Called after a document is uploaded and parsed.
 *
 * Pipeline:
 *   1. Document uploaded → fires docs:updated
 *   2. Cashflow recalculates → fires cashflow:updated
 *   3. Budget adjusts → fires budget:updated
 *   4. Goals recalculate → fires goals:updated
 *   5. Investments update → fires investments:updated
 *   6. Net worth recalculates → fires networth:updated (drives growth chart)
 */
export function triggerFullSync() {
  fireSync("verdant:docs:updated");
  markUpdated("docs");
  // Slight delays to allow each stage to process
  setTimeout(() => {
    fireSync("verdant:cashflow:updated");
    markUpdated("cashflow");
  }, 50);
  setTimeout(() => {
    fireSync("verdant:budgets:updated");
    markUpdated("budget");
  }, 100);
  setTimeout(() => {
    fireSync("verdant:goals:updated");
    markUpdated("goals");
  }, 150);
  setTimeout(() => {
    fireSync("verdant:investments:updated");
    markUpdated("investments");
  }, 200);
  setTimeout(() => {
    fireSync("verdant:networth:updated");
    markUpdated("networth");
  }, 250);
}

/**
 * Trigger investment-specific cascade: investments → networth → growth chart.
 * Called after securities are edited/added/deleted.
 */
export function triggerInvestmentSync() {
  fireSync("verdant:investments:updated");
  markUpdated("investments");
  setTimeout(() => {
    fireSync("verdant:networth:updated");
    markUpdated("networth");
  }, 50);
}

/**
 * Read the last-updated timestamp for a data domain.
 * Helps pages know if they need to refresh.
 */
const TIMESTAMP_PREFIX = "verdant:sync_ts:";

export function markUpdated(domain: string) {
  try {
    localStorage.setItem(TIMESTAMP_PREFIX + domain, String(Date.now()));
  } catch {}
}

export function lastUpdated(domain: string): number {
  try {
    const raw = localStorage.getItem(TIMESTAMP_PREFIX + domain);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}
