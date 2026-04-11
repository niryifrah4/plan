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

const STORAGE_KEY = "verdant:budgets";
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
  { key: "food",          label: "מזון וצריכה",         budget: 4000, color: "#10b981" },
  { key: "housing",       label: "דיור ומגורים",         budget: 6000, color: "#0a7a4a" },
  { key: "transport",     label: "תחבורה ורכב",          budget: 2500, color: "#3b82f6" },
  { key: "utilities",     label: "חשבונות שוטפים",       budget: 1500, color: "#f59e0b" },
  { key: "health",        label: "בריאות",                budget: 800,  color: "#ef4444" },
  { key: "education",     label: "חינוך וילדים",          budget: 2500, color: "#8b5cf6" },
  { key: "insurance",     label: "ביטוח",                 budget: 1200, color: "#06b6d4" },
  { key: "leisure",       label: "פנאי ובידור",           budget: 1500, color: "#ec4899" },
  { key: "shopping",      label: "קניות",                 budget: 1500, color: "#f97316" },
  { key: "dining_out",    label: "אוכל בחוץ ובילויים",    budget: 1200, color: "#e11d48" },
  { key: "subscriptions", label: "מנויים",                budget: 400,  color: "#a855f7" },
];

export function loadBudgets(): BudgetCategory[] {
  if (typeof window === "undefined") return DEFAULT_BUDGETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_BUDGETS;
}

export function saveBudgets(budgets: BudgetCategory[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
  window.dispatchEvent(new Event("verdant:budgets:updated"));
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
    const raw = localStorage.getItem(TX_KEY);
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
