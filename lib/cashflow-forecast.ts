/**
 * Cashflow forecast — projects 12 months of net cashflow ahead.
 *
 * Built 2026-05-02 per Nir's "tell me what WILL be, not just what is".
 *
 * Inputs (from existing stores):
 *   - current month income + expenses (budget-store)
 *   - assumptions (salary growth, monthly investment)
 *   - upcoming one-time events (kids, recurring goal cycles)
 *   - debt store (loans that might end mid-window)
 *
 * Outputs: 12 monthly projections + alerts on negative months.
 *
 * Simplifications:
 *   - Ignores tax variations (we just project net)
 *   - Salary grows linearly by salaryGrowthRate / 12 each month
 *   - One-time events come from a known set (annual vacation, school start)
 */

import { loadAssumptions } from "./assumptions";
import { loadDebtData } from "./debt-store";
import { buildBudgetLines, totalBudget, deriveMonthlyIncomeFromBudget, deriveMonthlyExpensesFromBudget } from "./budget-store";

export interface ForecastMonth {
  /** YYYY-MM */
  ym: string;
  /** Hebrew label, e.g. "ינואר 2027" */
  label: string;
  /** Projected income for this month (₪). */
  income: number;
  /** Projected expenses (₪). */
  expenses: number;
  /** income - expenses (₪). */
  netCashflow: number;
  /** Notable events for this month (free text, multiple lines). */
  events: string[];
  /** Color hint for charting: green / amber / red. */
  status: "good" | "tight" | "negative";
}

const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Build the 12-month forecast starting next month. */
export function buildForecast(): ForecastMonth[] {
  if (typeof window === "undefined") return [];

  const a = loadAssumptions();
  const debt = loadDebtData();

  // Base monthly numbers — derived from current budget.
  const lines = buildBudgetLines(0);
  const totals = totalBudget(lines);
  const baseIncome = deriveMonthlyIncomeFromBudget(a.monthlyIncome || 0)
                   || (a.monthlyIncome || 0)
                   || totals.budget;
  const baseExpenses = deriveMonthlyExpensesFromBudget(a.monthlyExpenses || 0)
                     || (a.monthlyExpenses || 0)
                     || totals.actual;

  // Salary growth — applied as monthly compounding to be smooth.
  const annualGrowth = a.salaryGrowthRate || 0;
  const monthlyGrowth = annualGrowth / 12;

  // Loan payments — sum of monthly mortgage + loan installments active each month.
  // For each loan, figure out how many monthly payments remain. If the loan
  // ends mid-window, mark the month with an event and drop the payment.
  const loanScheds = (debt.loans || []).map(l => {
    const monthly = l.monthlyPayment || 0;
    const remainingPays = Math.max(0, l.totalPayments || 0);
    return { lender: l.lender, monthly, remainingPays };
  });

  // Mortgage: aggregate from tracks. Estimate end based on weighted balance
  // + monthly payment + average rate.
  const mortgageTracks = debt.mortgage?.tracks || [];
  let mortgageMonthly = mortgageTracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  const mortgageBalance = mortgageTracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const mortgageRate = mortgageTracks.length > 0
    ? mortgageTracks.reduce((s, t) => s + (t.interestRate || 0.05) * (t.remainingBalance || 0), 0)
      / Math.max(1, mortgageBalance)
    : 0.05;
  const originalMortgageMonthly = mortgageMonthly;
  const mortgageMonthsLeft = (() => {
    if (!mortgageMonthly || !mortgageBalance) return 0;
    const r = mortgageRate / 12;
    const ratio = (mortgageBalance * r) / mortgageMonthly;
    if (ratio >= 1 || ratio <= 0) return 360;
    return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
  })();

  // Build 12 months
  const out: ForecastMonth[] = [];
  const start = addMonths(new Date(), 1); // start next month
  let income = baseIncome;
  // Salary boost month (e.g. annual bonus) — heuristic: month 12 of fiscal year
  // i.e. June bonus is a common Israeli pattern. We add a "bonus" event.

  for (let i = 0; i < 12; i++) {
    const d = addMonths(start, i);
    const ym = ymOf(d);
    const label = `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const events: string[] = [];

    // Apply salary growth
    income *= 1 + monthlyGrowth;

    let expenses = baseExpenses;

    // Drop mortgage payment if mortgage ended within this window
    if (mortgageMonthly > 0 && i + 1 >= mortgageMonthsLeft) {
      events.push(`✅ סיום משכנתא — ₪${Math.round(mortgageMonthly).toLocaleString()}/חודש מתפנה`);
      mortgageMonthly = 0; // future months: also no mortgage
    }

    // Drop loans that end this month
    for (const ls of loanScheds) {
      if (ls.remainingPays > 0) {
        ls.remainingPays--;
        if (ls.remainingPays === 0 && ls.monthly > 0) {
          events.push(`✅ סיום הלוואה ${ls.lender} — ₪${Math.round(ls.monthly).toLocaleString()}/חודש מתפנה`);
        }
      }
    }

    // Recompute expenses considering mortgage already in baseExpenses;
    // when mortgage ends, subtract the saved amount from expenses going forward.
    if (mortgageMonthly === 0 && originalMortgageMonthly > 0) {
      expenses -= originalMortgageMonthly;
    }

    // Annual events:
    if (d.getMonth() === 6) events.push("☀️ קיץ — חופשה משפחתית"); // July
    if (d.getMonth() === 8) events.push("🎒 שנה ראשונה — שכר לימוד / חוגים"); // September
    if (d.getMonth() === 11) events.push("🎁 חגים + מתנות"); // December

    // Bonus month — June, optional
    if (d.getMonth() === 5 && annualGrowth > 0) {
      const bonus = Math.round(income * 0.5); // half-month bonus default
      income += bonus;
      events.push(`💰 בונוס שנתי משוער ₪${bonus.toLocaleString()}`);
    }

    const netCashflow = Math.round(income - expenses);
    let status: ForecastMonth["status"] = "good";
    if (netCashflow < 0) status = "negative";
    else if (netCashflow < income * 0.05) status = "tight";

    out.push({
      ym,
      label,
      income: Math.round(income),
      expenses: Math.round(expenses),
      netCashflow,
      events,
      status,
    });
  }

  return out;
}
