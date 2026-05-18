/**
 * Discover Aggregator — turns parsed bank/credit transactions into the
 * "Spending Snapshot" view CFP advisors use in the discovery session.
 *
 * Per finance-agent 2026-05-16:
 *   • Standard horizon is 6 months (3 = minimum, 12 = ideal).
 *   • Categories aggregate by their NATURAL category (food / leisure / etc.)
 *     not by installments-as-a-bucket — so the family sees that "shopping
 *     was 4,200 in May because of 3 active installment payments".
 *   • The killer KPI is "monthly avg × 12 = projected annual" — the number
 *     that actually stops a couple in conversation.
 *   • Anomaly = a category whose worst month is 50%+ higher than its best,
 *     OR a month whose total is 25%+ above the trailing average.
 *
 * Output is a pure data structure — the React view binds to it.
 */

import type { ParsedTransaction } from "./doc-parser/types";
import { loadParsedTransactions } from "./budget-import";

const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export interface MonthSlot {
  /** YYYY-MM identifier. */
  ym: string;
  /** Display label e.g. "מאי 2026". */
  label: string;
  /** Total spending (positive = money out). */
  expenses: number;
  /** Total income (positive). */
  income: number;
  /** Net cashflow for the month. */
  net: number;
  /** Count of transactions classified as installment payments (for the
   *  "X תשלומים פעילים בחודש" badge in the snapshot row). */
  installmentTxCount: number;
}

export interface CategoryRow {
  key: string;
  label: string;
  /** Monthly totals indexed by ym. Missing = 0. */
  byMonth: Record<string, number>;
  /** Average across the window. */
  average: number;
  /** Spread (max − min). Used to detect volatile categories. */
  spread: number;
  /** Worst month / average ratio − 1. >0.50 → flagged as volatile. */
  volatility: number;
  /** Trend delta = last month vs previous month (₪). */
  lastDelta: number;
  /** Number of installment-tagged transactions in the window for this
   *  category. Lets the UI badge "כולל X תשלומים פעילים". */
  installmentTxCount: number;
}

export interface AnomalyMonth {
  ym: string;
  label: string;
  /** This month's expenses. */
  total: number;
  /** Trailing average of the OTHER months in the window. */
  baseline: number;
  /** total − baseline. */
  delta: number;
  /** Top contributing transaction(s) that pushed the month over (~3 max). */
  topContributors: Array<{ description: string; amount: number; categoryLabel: string }>;
}

export interface DiscoverSummary {
  /** Months in chronological order, oldest first. */
  months: MonthSlot[];
  /** Spending rows in descending order of average. */
  categories: CategoryRow[];
  /** Months whose total exceeded the trailing average by 25%+. */
  anomalies: AnomalyMonth[];
  /** Average monthly EXPENSES across the window. */
  avgMonthlyExpenses: number;
  /** Average monthly INCOME across the window. */
  avgMonthlyIncome: number;
  /** Average monthly NET (income − expenses). */
  avgMonthlyNet: number;
  /** avgMonthlyExpenses × 12 — the "annual projection" killer KPI. */
  annualProjectedExpenses: number;
  /** Savings rate: avg net / avg income. */
  avgSavingsRate: number;
  /** Window length in months. */
  monthsCovered: number;
  /** Total transactions in the window — surfaced when very low to warn
   *  the family that the dataset is too thin to be representative. */
  txCount: number;
}

/**
 * Build the discover summary for the last N months ending at the current
 * month (exclusive of the current month, which is still in progress).
 *
 * If the user is mid-month and we want to include this month too, pass
 * `includeCurrent: true`. Default behavior matches the CFP norm of looking
 * at *closed* months.
 */
export function buildDiscoverSummary(
  monthsBack: number,
  options: { includeCurrent?: boolean } = {}
): DiscoverSummary {
  const txs = loadParsedTransactions();
  return aggregateTransactions(txs, monthsBack, options);
}

/**
 * Pure function — split out so unit tests can pass synthetic transaction
 * arrays without touching localStorage.
 */
export function aggregateTransactions(
  txs: ParsedTransaction[],
  monthsBack: number,
  options: { includeCurrent?: boolean } = {}
): DiscoverSummary {
  const now = new Date();
  // Window endpoint: previous full month, unless includeCurrent says otherwise.
  const endIdx = options.includeCurrent ? 0 : -1;
  const months: MonthSlot[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const offset = endIdx - i;
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      ym,
      label: `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      expenses: 0,
      income: 0,
      net: 0,
      installmentTxCount: 0,
    });
  }
  const monthByYm = new Map(months.map((m) => [m.ym, m]));

  // ───── First pass: per-month totals + category roll-up ─────
  const catMap = new Map<string, CategoryRow>();
  const monthTransactions = new Map<string, ParsedTransaction[]>();

  for (const tx of txs) {
    if (!tx?.date) continue;
    const d = new Date(tx.date);
    if (isNaN(d.getTime())) continue;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = monthByYm.get(ym);
    if (!slot) continue;

    // Skip pure transfers — they aren't real income/expense (matches the
    // same convention used in budget-import.ts).
    if (tx.category === "transfers") continue;

    const isExpense = tx.amount > 0; // parser convention: positive = debit
    const abs = Math.abs(tx.amount);

    if (isExpense) {
      slot.expenses += abs;
      // Track per-category roll-up — keyed by category, not by buckets,
      // so installment payments still surface inside their natural
      // category (Amazon → shopping) but counted separately.
      const key = tx.category || "other";
      const label = tx.categoryLabel || tx.category || "אחר";
      let row = catMap.get(key);
      if (!row) {
        row = {
          key,
          label,
          byMonth: {},
          average: 0,
          spread: 0,
          volatility: 0,
          lastDelta: 0,
          installmentTxCount: 0,
        };
        catMap.set(key, row);
      }
      row.byMonth[ym] = (row.byMonth[ym] || 0) + abs;
      if (isInstallmentTx(tx)) {
        row.installmentTxCount += 1;
        slot.installmentTxCount += 1;
      }
    } else {
      slot.income += abs;
    }

    const list = monthTransactions.get(ym) || [];
    list.push(tx);
    monthTransactions.set(ym, list);
  }

  for (const m of months) m.net = m.income - m.expenses;

  // ───── Compute category averages, spread, volatility, delta ─────
  const categories: CategoryRow[] = [];
  for (const row of catMap.values()) {
    const monthlyValues = months.map((m) => row.byMonth[m.ym] || 0);
    const sum = monthlyValues.reduce((s, v) => s + v, 0);
    const avg = sum / months.length;
    const max = Math.max(...monthlyValues);
    const min = Math.min(...monthlyValues);
    row.average = Math.round(avg);
    row.spread = Math.round(max - min);
    row.volatility = avg > 0 ? max / avg - 1 : 0;
    if (months.length >= 2) {
      const lastVal = monthlyValues[monthlyValues.length - 1];
      const prevVal = monthlyValues[monthlyValues.length - 2];
      row.lastDelta = Math.round(lastVal - prevVal);
    }
    if (sum > 0) categories.push(row);
  }
  categories.sort((a, b) => b.average - a.average);

  // ───── Anomaly months (>25% above trailing average of others) ─────
  const anomalies: AnomalyMonth[] = [];
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    const others = months.filter((_, j) => j !== i);
    const baseline =
      others.reduce((s, o) => s + o.expenses, 0) / Math.max(1, others.length);
    if (baseline <= 0) continue;
    if (m.expenses < baseline * 1.25) continue;
    const txList = (monthTransactions.get(m.ym) || [])
      .filter((t) => t.amount > 0 && t.category !== "transfers")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((t) => ({
        description: t.description,
        amount: Math.round(t.amount),
        categoryLabel: t.categoryLabel || t.category || "אחר",
      }));
    anomalies.push({
      ym: m.ym,
      label: m.label,
      total: Math.round(m.expenses),
      baseline: Math.round(baseline),
      delta: Math.round(m.expenses - baseline),
      topContributors: txList,
    });
  }

  // ───── Aggregate KPIs ─────
  const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const avgMonthlyExpenses = Math.round(totalExpenses / months.length);
  const avgMonthlyIncome = Math.round(totalIncome / months.length);
  const avgMonthlyNet = avgMonthlyIncome - avgMonthlyExpenses;
  const avgSavingsRate = avgMonthlyIncome > 0 ? avgMonthlyNet / avgMonthlyIncome : 0;

  return {
    months,
    categories,
    anomalies,
    avgMonthlyExpenses,
    avgMonthlyIncome,
    avgMonthlyNet,
    annualProjectedExpenses: avgMonthlyExpenses * 12,
    avgSavingsRate,
    monthsCovered: months.length,
    txCount: txs.length,
  };
}

/**
 * A transaction is "installment-tagged" if its description matches the
 * standard Israeli card patterns (X מתוך Y / X/Y תשלומים / etc.). We don't
 * import the full extractor here — just the regex check — to keep this
 * file dependency-light.
 */
function isInstallmentTx(tx: ParsedTransaction): boolean {
  if (!tx.description) return false;
  const d = tx.description;
  return (
    /תשלום\s*\d+\s*מתוך\s*\d+/i.test(d) ||
    /\d+\s*\/\s*\d+\s*תשלומים?/i.test(d) ||
    /תשלום\s*\d+\s*\/\s*\d+/i.test(d) ||
    /תש\.?\s*\d+\s*\/\s*\d+/i.test(d)
  );
}
