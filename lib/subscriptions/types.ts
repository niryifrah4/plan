/** Subscriptions — shared types for the two-layer model. */

export type SubscriptionDecision = "subscription" | "not_subscription";

/** Layer 1 — a single client's decision for one merchant key. */
export interface SubscriptionOverride {
  normalizedKey: string;
  aliases: string[];
  decision: SubscriptionDecision;
  label: string;
  /** Whether the decision also covers transactions dated before `updatedAt`. */
  appliesToPast: boolean;
  updatedAt: string;
}

/** Layer 2 — a system-catalog entry (always "is a subscription" per spec). */
export interface CatalogMerchant {
  normalizedKey: string;
  aliases: string[];
  isSubscription: boolean;
  label: string;
}

/** Aggregated learning signal shown to admins. */
export interface LearningSuggestion {
  normalizedKey: string;
  sampleLabel: string;
  clientCount: number;
  inCatalog: boolean;
}
