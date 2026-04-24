/**
 * Verdant Ledger · Passive Income Aggregator
 * ───────────────────────────────────────────
 * Single source of truth for *passive* (asset-generated) monthly income:
 *   • Net rental from investment / commercial real estate
 *   • (Future) Dividend distributions from securities
 *
 * Rationale — "Forward Planner, Rule #1": passive income must NOT be
 * entered manually as a cashflow line in the budget, because it would
 * double-count against the wealth trajectory (which already compounds
 * re-invested savings via Savings Rate). Instead, the budget's income
 * section reads these values via `injectPassiveIncomeRows()` as
 * read-only rows synced from the asset stores.
 */

import { loadProperties, type Property } from "./realestate-store";

export interface PassiveIncomeSource {
  /** Stable id, used as the BudgetRow id so re-injection is idempotent. */
  id: string;
  /** Display label, e.g. "שכ״ד — דירה השקעה רמת גן" */
  label: string;
  /** Net monthly amount (rent − expenses), clamped to ≥ 0. */
  monthly: number;
  /** Origin store for sync & deep-link. */
  origin: "realestate" | "securities" | "pension";
  /** Source entity id for traceability. */
  sourceId?: string;
}

export interface PassiveIncomeSummary {
  sources: PassiveIncomeSource[];
  totalMonthly: number;
  realEstateMonthly: number;
  dividendsMonthly: number;
}

/** Net monthly rent for a property = rent − direct expenses (non-negative). */
export function propertyNetMonthlyRent(p: Property): number {
  const rent = Number(p.monthlyRent) || 0;
  const expenses = Number(p.monthlyExpenses) || 0;
  // Mortgage payment is NOT subtracted here — it lives in /debt as a liability
  // and flows into the "fixed" expense section separately. Subtracting it
  // again would double-hit cashflow.
  return Math.max(0, rent - expenses);
}

/**
 * Aggregate passive income from all asset stores.
 * Dividends are stubbed (0) until securities-store gains a dividend field.
 */
export function getPassiveIncomeSummary(): PassiveIncomeSummary {
  if (typeof window === "undefined") {
    return { sources: [], totalMonthly: 0, realEstateMonthly: 0, dividendsMonthly: 0 };
  }

  const properties = loadProperties();
  const sources: PassiveIncomeSource[] = [];

  // ── Real estate ──
  let reTotal = 0;
  for (const p of properties) {
    if (p.type !== "investment" && p.type !== "commercial") continue;
    const net = propertyNetMonthlyRent(p);
    if (net <= 0) continue;
    reTotal += net;
    sources.push({
      id: `passive:re:${p.id}`,
      label: `שכ״ד — ${p.name}`,
      monthly: Math.round(net),
      origin: "realestate",
      sourceId: p.id,
    });
  }

  // ── Dividends (placeholder) ──
  // When securities-store adds a distribution/yield field, sum them here.
  const divTotal = 0;

  return {
    sources,
    totalMonthly: Math.round(reTotal + divTotal),
    realEstateMonthly: Math.round(reTotal),
    dividendsMonthly: Math.round(divTotal),
  };
}
