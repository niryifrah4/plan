/**
 * Budget Store — Actual vs Budget per category.
 *
 * Real-time comparison between the user's planned monthly budget and
 * what actually flowed through the parsed transactions. Updates live as
 * new documents are uploaded.
 *
 * Storage: localStorage key `verdant:budgets`
 * Transaction source: localStorage key `verdant:parsed_transactions`
 */

import { scopedKey } from "./client-scope";

import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:budgets";
const BLOB_KEY = "budgets";
const TX_KEY = "verdant:parsed_transactions";

export interface BudgetCategory {
  key: string;            // e.g. "leisure"
  label: string;          // "פנאי ובידור"
  budget: number;         // monthly budget ₪
  color: string;
}

export interface BudgetLine extends BudgetCategory {
  actual: number;         // sum of positive (debit) amounts in the period
  remaining: number;      // budget − actual
  pct: number;            // actual / budget
  status: "safe" | "warning" | "over";
}

/** Default monthly budgets — sensible starting point for Israeli families */
export const DEFAULT_BUDGETS: BudgetCategory[] = [
  { key: "food",          label: "מזון וצריכה",         budget: 4000, color: "#2B694D" },
  { key: "housing",       label: "דיור ומגורים",         budget: 6000, color: "#1B4332" },
  { key: "transport",     label: "תחבורה ורכב",          budget: 2500, color: "#3b82f6" },
  { key: "utilities",     label: "חשבונות שוטפים",       budget: 1500, color: "#f59e0b" },
  { key: "health",        label: "בריאות",                budget: 800,  color: "#ef4444" },
  { key: "education",     label: "חינוך וילדים",          budget: 2500, color: "#2B694D" },
  { key: "insurance",     label: "ביטוח",                 budget: 1200, color: "#06b6d4" },
  { key: "leisure",       label: "פנאי ובידור",           budget: 1500, color: "#ec4899" },
  { key: "shopping",      label: "קניות",                 budget: 1500, color: "#f97316" },
  { key: "dining_out",    label: "אוכל בחוץ ובילויים",    budget: 1200, color: "#e11d48" },
  { key: "subscriptions", label: "מנויים",                budget: 400,  color: "#2B694D" },
];

export function loadBudgets(): BudgetCategory[] {
  if (typeof window === "undefined") return DEFAULT_BUDGETS;
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_BUDGETS;
}

export function saveBudgets(budgets: BudgetCategory[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(budgets));
  window.dispatchEvent(new Event("verdant:budgets:updated"));
  pushBlobInBackground(BLOB_KEY, budgets);
}

export async function hydrateBudgetsFromRemote(): Promise<boolean> {
  const remote = await pullBlob<BudgetCategory[]>(BLOB_KEY);
  if (!remote || !Array.isArray(remote)) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    window.dispatchEvent(new Event("verdant:budgets:updated"));
    return true;
  } catch {
    return false;
  }
}

export function updateBudgetAmount(key: string, newBudget: number) {
  const budgets = loadBudgets();
  const updated = budgets.map(b => (b.key === key ? { ...b, budget: newBudget } : b));
  saveBudgets(updated);
}

interface StoredTx {
  date: string;
  amount: number;
  category: string;
}

/**
 * Compute actuals by category for a given month window.
 * @param monthsBack 0 = current month, 1 = last month, etc.
 */
export function computeActuals(monthsBack = 0): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(scopedKey(TX_KEY));
    if (!raw) return {};
    const txs: StoredTx[] = JSON.parse(raw);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const targetMonth = target.getMonth();
    const targetYear = target.getFullYear();

    const actuals: Record<string, number> = {};
    for (const t of txs) {
      if (!t.date || t.amount <= 0) continue; // only expenses
      const d = new Date(t.date);
      if (d.getMonth() !== targetMonth || d.getFullYear() !== targetYear) continue;
      actuals[t.category] = (actuals[t.category] || 0) + t.amount;
    }
    return actuals;
  } catch {
    return {};
  }
}

/**
 * Build the full budget vs actual view for the month.
 */
export function buildBudgetLines(monthsBack = 0): BudgetLine[] {
  const budgets = loadBudgets();
  const actuals = computeActuals(monthsBack);

  return budgets.map(b => {
    const actual = Math.round(actuals[b.key] || 0);
    const remaining = b.budget - actual;
    const pct = b.budget > 0 ? actual / b.budget : 0;
    const status: BudgetLine["status"] =
      pct >= 1 ? "over" : pct >= 0.8 ? "warning" : "safe";
    return { ...b, actual, remaining, pct, status };
  });
}

export function totalBudget(lines: BudgetLine[]): { budget: number; actual: number; remaining: number } {
  return lines.reduce(
    (acc, l) => ({
      budget: acc.budget + l.budget,
      actual: acc.actual + l.actual,
      remaining: acc.remaining + l.remaining,
    }),
    { budget: 0, actual: 0, remaining: 0 }
  );
}

/**
 * ═══════════════════════════════════════════════════════════
 *  Derived totals — the budget is the SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════
 *
 * The onboarding questionnaire seeds the budget once (via
 * syncBudgetFromExpenses) and then backs off. From that point
 * forward, the client edits only the budget — and anywhere else
 * in the app that needs "monthly expenses" / "monthly income"
 * should call these helpers, NOT read assumptions.monthlyExpenses
 * directly, which is frozen at the onboarding seed value.
 *
 * Fallback order (per helper):
 *   1. Budget actuals (if there are any tracked expenses)
 *   2. Budget planned amounts (categories configured but no actuals yet)
 *   3. assumptions.monthlyExpenses (last-resort seed)
 *
 * The helpers return 0 only when all three are zero.
 */

/** Total monthly expenses from the budget. Returns 0 if budget is empty. */
export function deriveMonthlyExpensesFromBudget(fallback: number = 0): number {
  if (typeof window === "undefined") return fallback;
  try {
    const lines = buildBudgetLines(0);
    if (!lines.length) return fallback;
    const totals = totalBudget(lines);
    // Prefer actuals once the client started tracking; otherwise planned budget.
    if (totals.actual > 0) return totals.actual;
    if (totals.budget > 0) return totals.budget;
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Total monthly income from the budget page's hero row (salary + passive +
 * manual income). Stored per-month under verdant:budget_YYYY_MM. Uses the
 * most recent saved snapshot.
 */
export function deriveMonthlyIncomeFromBudget(fallback: number = 0): number {
  if (typeof window === "undefined") return fallback;
  try {
    const now = new Date();
    for (let back = 0; back < 12; back++) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const key = `verdant:budget_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}`;
      const raw = localStorage.getItem(scopedKey(key));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const income = parsed?.sections?.income;
      if (!Array.isArray(income) || income.length === 0) continue;
      const total = income.reduce((s: number, row: any) => s + (Number(row.actual) || Number(row.budget) || 0), 0);
      if (total > 0) return total;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
