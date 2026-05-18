/**
 * Discover → Plan bridge: turn the 3/6/12-month spending averages into a
 * forward budget the family can use as a starting point.
 *
 * Per finance-agent 2026-05-16: the right frame is **not** "average →
 * budget" (which mostly cements current habits) but "average → starting
 * point with choice". For each category over a threshold we give the user
 * three explicit options (keep / reduce 15% / reduce 30%) or a custom
 * amount — never a blank field, which is what stops a non-financial
 * couple from completing the step.
 *
 * The bridge updates the BUDGET column of the chosen target month — it
 * does NOT touch actuals. It also leaves locked rows (mortgage, loan
 * service injected from /debt) alone.
 */

import { CATEGORY_TO_BUDGET, type BudgetSection } from "./category-to-budget-map";
import { scopedKey } from "./client-scope";
import type { CategoryRow } from "./discover-aggregator";

export type DiscoverChoice = "keep" | "reduce15" | "reduce30" | "custom" | "skip";

export interface DiscoverChoiceMap {
  [categoryKey: string]: { choice: DiscoverChoice; customAmount?: number };
}

/** Round to nearest ₪50 — keeps the user-facing target a clean number. */
function roundToFifty(n: number): number {
  return Math.round(n / 50) * 50;
}

/** Translate a user choice into the final ₪ target. */
export function choiceToAmount(
  avg: number,
  choice: DiscoverChoice,
  customAmount?: number
): number {
  switch (choice) {
    case "keep":
      return roundToFifty(avg);
    case "reduce15":
      return roundToFifty(avg * 0.85);
    case "reduce30":
      return roundToFifty(avg * 0.7);
    case "custom":
      return Math.max(0, Math.round(customAmount || 0));
    case "skip":
      return 0;
  }
}

interface MinimalBudgetRow {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
  locked?: boolean;
  source?: string;
  subItems?: unknown[];
}

interface MinimalBudgetData {
  year: number;
  month: number;
  sections: Record<string, MinimalBudgetRow[]>;
  settled?: boolean;
}

const BUDGET_EVENT = "verdant:budgets:updated";
const uid = () => "r" + Math.random().toString(36).slice(2, 9);

function budgetKey(year: number, month: number): string {
  return `verdant:budget_${year}_${String(month + 1).padStart(2, "0")}`;
}

/** Apply target amounts to the budget rows of a given (year, month).
 *  Returns the count of rows updated/created/skipped for a UI toast. */
export function applyDiscoverToBudget(
  categories: CategoryRow[],
  choices: DiscoverChoiceMap,
  year: number,
  month: number
): { updated: number; created: number; skipped: number } {
  if (typeof window === "undefined") return { updated: 0, created: 0, skipped: 0 };

  let data: MinimalBudgetData | null = null;
  try {
    const raw = localStorage.getItem(scopedKey(budgetKey(year, month)));
    if (raw) data = JSON.parse(raw);
  } catch {
    /* corrupt — fall through to "no budget yet" */
  }

  // No existing budget → bail. The user has to navigate to that month first
  // so /budget/page.tsx seeds DEFAULT_SECTIONS. (Keeps this lib agnostic of
  // the default section structure.)
  if (!data || !data.sections) return { updated: 0, created: 0, skipped: 0 };

  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const cat of categories) {
    const userChoice = choices[cat.key];
    if (!userChoice || userChoice.choice === "skip") {
      skipped++;
      continue;
    }
    const target = CATEGORY_TO_BUDGET[cat.key];
    if (!target) {
      skipped++;
      continue;
    }
    const amount = choiceToAmount(cat.average, userChoice.choice, userChoice.customAmount);
    if (amount <= 0) {
      skipped++;
      continue;
    }

    const section: BudgetSection = target.section;
    const rows = data.sections[section] || [];
    const idx = rows.findIndex((r) => !r.locked && r.name === target.rowName);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], budget: amount };
      updated++;
    } else {
      rows.push({
        id: uid(),
        name: target.rowName,
        budget: amount,
        actual: 0,
        avg3: 0,
      });
      created++;
    }
    data.sections[section] = rows;
  }

  if (updated > 0 || created > 0) {
    try {
      localStorage.setItem(scopedKey(budgetKey(year, month)), JSON.stringify(data));
      window.dispatchEvent(new CustomEvent(BUDGET_EVENT));
    } catch (e) {
      console.warn("[discover-to-budget] save failed:", e);
    }
  }

  return { updated, created, skipped };
}

/** Convenience: apply to the CURRENT month. */
export function applyDiscoverToCurrentMonth(
  categories: CategoryRow[],
  choices: DiscoverChoiceMap
): { updated: number; created: number; skipped: number } {
  const now = new Date();
  return applyDiscoverToBudget(categories, choices, now.getFullYear(), now.getMonth());
}
