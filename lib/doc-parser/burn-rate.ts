/**
 * Burn Rate & Saving Rate Analytics
 * Calculates monthly spending patterns and detects anomalies.
 */

import type { ParsedTransaction } from "./types";
import { savingsRate as calcSavingsRate, monthlyNetSavings } from "@/lib/financial-math";

export interface MonthlyBreakdown {
  month: string;        // yyyy-mm
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  savingRate: number;   // 0–1 (% saved)
}

export interface BurnRateAnalysis {
  months: MonthlyBreakdown[];
  avgMonthlyExpense: number;
  avgMonthlyIncome: number;
  avgSavingRate: number;
  latestMonth: MonthlyBreakdown | null;
  alert: BurnRateAlert | null;
}

export interface BurnRateAlert {
  type: "overspend" | "negative_cashflow" | "low_savings";
  severity: "warning" | "critical";
  message: string;
  detail: string;
  pctDeviation: number; // how much above average (as %)
}

/**
 * Analyze burn rate from transactions.
 * Groups by month, calculates saving rate, detects 15%+ overspend.
 */
export function analyzeBurnRate(transactions: ParsedTransaction[]): BurnRateAnalysis {
  if (transactions.length === 0) {
    return {
      months: [],
      avgMonthlyExpense: 0,
      avgMonthlyIncome: 0,
      avgSavingRate: 0,
      latestMonth: null,
      alert: null,
    };
  }

  // Group transactions by month
  const byMonth = new Map<string, { income: number; expense: number }>();

  for (const t of transactions) {
    if (!t.date) continue;
    const month = t.date.substring(0, 7); // yyyy-mm
    const entry = byMonth.get(month) || { income: 0, expense: 0 };

    if (t.amount > 0) {
      entry.expense += t.amount;
    } else {
      entry.income += Math.abs(t.amount);
    }

    byMonth.set(month, entry);
  }

  // Build monthly breakdowns sorted by date
  const months: MonthlyBreakdown[] = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, { income, expense }]) => ({
      month,
      totalIncome: income,
      totalExpense: expense,
      netCashflow: monthlyNetSavings(income, expense),
      savingRate: calcSavingsRate(income, expense),
    }));

  if (months.length === 0) {
    return { months, avgMonthlyExpense: 0, avgMonthlyIncome: 0, avgSavingRate: 0, latestMonth: null, alert: null };
  }

  // Calculate averages (use last 3 months or all if less)
  const recentMonths = months.slice(-3);
  const avgMonthlyExpense = recentMonths.reduce((s, m) => s + m.totalExpense, 0) / recentMonths.length;
  const avgMonthlyIncome = recentMonths.reduce((s, m) => s + m.totalIncome, 0) / recentMonths.length;
  const avgSavingRate = calcSavingsRate(avgMonthlyIncome, avgMonthlyExpense);

  const latestMonth = months[months.length - 1];

  // Detect alerts
  let alert: BurnRateAlert | null = null;

  if (latestMonth && recentMonths.length >= 2) {
    // Compare latest month to average of previous months
    const prevMonths = months.slice(-4, -1); // up to 3 months before the latest
    if (prevMonths.length > 0) {
      const prevAvgExpense = prevMonths.reduce((s, m) => s + m.totalExpense, 0) / prevMonths.length;

      if (prevAvgExpense > 0) {
        const pctDeviation = ((latestMonth.totalExpense - prevAvgExpense) / prevAvgExpense) * 100;

        if (pctDeviation >= 25) {
          alert = {
            type: "overspend",
            severity: "critical",
            message: "חריגה חמורה מהתקציב המתוכנן",
            detail: `ההוצאות החודש גבוהות ב-${Math.round(pctDeviation)}% מהממוצע של ${prevMonths.length} החודשים האחרונים`,
            pctDeviation: Math.round(pctDeviation),
          };
        } else if (pctDeviation >= 15) {
          alert = {
            type: "overspend",
            severity: "warning",
            message: "חריגה מהתקציב המתוכנן",
            detail: `ההוצאות החודש גבוהות ב-${Math.round(pctDeviation)}% מהממוצע של ${prevMonths.length} החודשים האחרונים`,
            pctDeviation: Math.round(pctDeviation),
          };
        }
      }
    }

    // Negative cashflow alert
    if (!alert && latestMonth.netCashflow < 0) {
      alert = {
        type: "negative_cashflow",
        severity: "critical",
        message: "תזרים שלילי — גירעון חודשי",
        detail: `ההוצאות עולות על ההכנסות ב-₪${Math.abs(Math.round(latestMonth.netCashflow)).toLocaleString("he-IL")}`,
        pctDeviation: 0,
      };
    }

    // Low savings alert
    if (!alert && latestMonth.savingRate < 0.05 && latestMonth.totalIncome > 0) {
      alert = {
        type: "low_savings",
        severity: "warning",
        message: "שיעור חיסכון נמוך",
        detail: `שיעור החיסכון החודשי הוא ${Math.round(latestMonth.savingRate * 100)}% בלבד — מומלץ לחסוך 10%+`,
        pctDeviation: 0,
      };
    }
  }

  return {
    months,
    avgMonthlyExpense,
    avgMonthlyIncome,
    avgSavingRate,
    latestMonth,
    alert,
  };
}
