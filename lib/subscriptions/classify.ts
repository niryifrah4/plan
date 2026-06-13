/**
 * ═══════════════════════════════════════════════════════════
 *  Subscriptions — decision precedence
 * ═══════════════════════════════════════════════════════════
 *
 * One question, answered in a fixed order of authority:
 *
 *   1. Client override   — the client's own decision always wins.
 *   2. System catalog    — the learned global default.
 *   3. Auto-detect       — left to the recurring-radar heuristic (→ null).
 *
 * Returns:
 *   true  → treat as a subscription
 *   false → explicitly NOT a subscription
 *   null  → unknown; fall back to the automatic recurring detection
 */

import { subscriptionKey } from "./normalize";
import type { CatalogMerchant, SubscriptionOverride } from "./types";

export interface SubscriptionLookup {
  overrides: SubscriptionOverride[];
  catalog: CatalogMerchant[];
}

export function classifySubscription(
  description: string,
  { overrides, catalog }: SubscriptionLookup
): boolean | null {
  const key = subscriptionKey(description);
  if (!key) return null;

  // 1. Client override wins outright.
  const override = overrides.find((o) => o.normalizedKey === key);
  if (override) return override.decision === "subscription";

  // 2. System catalog default.
  const catalogHit = catalog.find((m) => m.normalizedKey === key);
  if (catalogHit) return catalogHit.isSubscription;

  // 3. Unknown — let the caller's auto-detection decide.
  return null;
}

/**
 * Same as `classifySubscription`, but honours the override's `appliesToPast`
 * flag against a specific transaction date. A "subscription" decision with
 * appliesToPast=false does NOT cover transactions dated before the decision;
 * those fall through to the catalog / auto-detection.
 */
export function classifySubscriptionForTransaction(
  description: string,
  txDate: string | undefined,
  { overrides, catalog }: SubscriptionLookup
): boolean | null {
  const key = subscriptionKey(description);
  if (!key) return null;

  const override = overrides.find((o) => o.normalizedKey === key);
  if (override) {
    const covers =
      override.appliesToPast ||
      !txDate ||
      txDate >= override.updatedAt.slice(0, 10);
    if (covers) return override.decision === "subscription";
    // Decision doesn't reach this older transaction — fall through.
  }

  const catalogHit = catalog.find((m) => m.normalizedKey === key);
  if (catalogHit) return catalogHit.isSubscription;
  return null;
}

/** Build O(1) lookup maps once, for hot paths that classify many rows. */
export function buildSubscriptionIndex({ overrides, catalog }: SubscriptionLookup) {
  const overrideMap = new Map(overrides.map((o) => [o.normalizedKey, o]));
  const catalogMap = new Map(catalog.map((m) => [m.normalizedKey, m]));
  return (description: string): boolean | null => {
    const key = subscriptionKey(description);
    if (!key) return null;
    const o = overrideMap.get(key);
    if (o) return o.decision === "subscription";
    const c = catalogMap.get(key);
    if (c) return c.isSubscription;
    return null;
  };
}
