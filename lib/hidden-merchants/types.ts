/** Hidden merchants — shared types for the two-layer model. */

export type HiddenDecision = "hidden" | "visible";

/** Layer 1 — a single client's decision for one merchant key. */
export interface HiddenOverride {
  normalizedKey: string;
  aliases: string[];
  decision: HiddenDecision;
  label: string;
  updatedAt: string;
}

/** Layer 2 — a system-catalog entry (default-hide for everyone). */
export interface HiddenCatalogMerchant {
  normalizedKey: string;
  aliases: string[];
  isHidden: boolean;
  label: string;
}

/** Aggregated learning signal shown to advisors. */
export interface HiddenLearningSuggestion {
  normalizedKey: string;
  sampleLabel: string;
  clientCount: number;
  inCatalog: boolean;
}
