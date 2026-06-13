/**
 * ═══════════════════════════════════════════════════════════
 *  Hidden merchants — decision precedence + effective set
 * ═══════════════════════════════════════════════════════════
 *
 * Should this merchant be hidden? Fixed order of authority:
 *   1. Client override — hide/show always wins.
 *   2. System catalog  — default-hide.
 *   3. Otherwise        — visible (→ null).
 */

import { hiddenMerchantKey } from "./normalize";
import type { HiddenCatalogMerchant, HiddenOverride } from "./types";

export interface HiddenLookup {
  overrides: HiddenOverride[];
  catalog: HiddenCatalogMerchant[];
}

/** true = hide, false = explicitly show, null = no opinion (default visible). */
export function classifyHidden(
  description: string,
  { overrides, catalog }: HiddenLookup
): boolean | null {
  const key = hiddenMerchantKey(description);
  if (!key) return null;

  const override = overrides.find((o) => o.normalizedKey === key);
  if (override) return override.decision === "hidden";

  const catalogHit = catalog.find((m) => m.normalizedKey === key);
  if (catalogHit) return catalogHit.isHidden;

  return null;
}

/**
 * Build the effective set of hidden merchant KEYS for the queue/cashflow.
 *
 * Starts from `extraKeys` (e.g. the legacy `buildExcludedSet()` so nothing
 * regresses), adds catalog default-hides and client "hidden" overrides, then
 * removes any key the client explicitly marked "visible" (client wins).
 */
export function buildEffectiveHiddenSet(
  { overrides, catalog }: HiddenLookup,
  extraKeys: Iterable<string> = []
): Set<string> {
  const set = new Set<string>(extraKeys);
  for (const m of catalog) if (m.isHidden) set.add(m.normalizedKey);
  for (const o of overrides) {
    if (o.decision === "hidden") set.add(o.normalizedKey);
    else set.delete(o.normalizedKey); // explicit "visible" overrides everything
  }
  return set;
}
