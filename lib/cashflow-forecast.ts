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
import {
  loadDebtData,
  getAllMortgageTracks,
  effectiveTrackRate,
  trackCpiRate,
} from "./debt-store";
import { projectIndexedLoan } from "@shared/financial-math";
import { buildBudgetLines, totalBudget, deriveMonthlyExpensesFromBudget } from "./budget-store";
import { getMonthlyNetIncome } from "./income";
import { loadSpecialEvents } from "./special-events-store";

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

  // Base monthly numbers.
  // 2026-05-05: income now comes from getMonthlyNetIncome — single source of
  // truth (ONB_INCOMES net values, fallback to gross→net via salary engine).
  // Previously this fell back to assumptions.monthlyIncome (gross), which
  // produced inflated forecasts that didn't match what hits the bank.
  const lines = buildBudgetLines(0);
  const totals = totalBudget(lines);
  const baseIncome = getMonthlyNetIncome() || totals.budget;
  const baseExpenses =
    deriveMonthlyExpensesFromBudget(a.monthlyExpenses || 0) ||
    a.monthlyExpenses ||
    0 ||
    totals.actual;

  // Salary growth — applied as monthly compounding to be smooth.
  const annualGrowth = a.salaryGrowthRate || 0;
  const monthlyGrowth = annualGrowth / 12;

  // Loan payments — sum of monthly mortgage + loan installments active each month.
  // For each loan, figure out how many monthly payments remain. If the loan
  // ends mid-window, mark the month with an event and drop the payment.
  const loanScheds = (debt.loans || []).map((l) => {
    const monthly = l.monthlyPayment || 0;
    const remainingPays = Math.max(0, l.totalPayments || 0);
    return { lender: l.lender, monthly, remainingPays };
  });

  // Installment schedules — credit-card multi-payment commitments (3/12, 5/24…).
  // Same shape as loans: each entry decrements one payment per month and, on
  // the final payment, surfaces a "freed-up" event. `currentPayment` is the
  // *next* installment due (per isInstallmentActive: active while
  // currentPayment <= totalPayments). So remaining ahead of the forecast =
  // totalPayments - currentPayment + 1 (inclusive of the upcoming month).
  // (2026-05-12 per Nir: forward cashflow visibility for installments.)
  const installmentScheds = (debt.installments || [])
    .filter((inst) => inst.currentPayment <= inst.totalPayments)
    .map((inst) => ({
      merchant: inst.merchant || "עסקת תשלומים",
      monthly: inst.monthlyAmount || 0,
      remainingPays: Math.max(0, (inst.totalPayments || 0) - (inst.currentPayment || 0) + 1),
    }));

  // Mortgage: aggregate from tracks.
  // 2026-05-21 Phase 3: project each track separately so CPI-linked tracks
  // ("מדד") use their real-rate + inflation projection while fixed tracks use
  // the closed form. The forecast's "mortgage ends" event fires when the
  // LONGEST-running track finishes — approximation, but accurate enough for
  // the 12-month cashflow horizon this engine targets.
  const mortgageTracks = getAllMortgageTracks(debt);
  let mortgageMonthly = mortgageTracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  const mortgageBalance = mortgageTracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const originalMortgageMonthly = mortgageMonthly;
  const mortgageMonthsLeft = (() => {
    if (!mortgageMonthly || !mortgageBalance) return 0;
    let maxMonths = 0;
    for (const t of mortgageTracks) {
      const balance = t.remainingBalance || 0;
      const monthly = t.monthlyPayment || 0;
      if (!balance || !monthly) continue;
      const rate = effectiveTrackRate(t, a.primeRate) || 0.05;
      const cpi = trackCpiRate(t, a.inflationRate);
      const months = projectIndexedLoan(balance, monthly, rate, cpi).monthsRemaining;
      if (months > maxMonths) maxMonths = months;
    }
    return maxMonths;
  })();

  // User-defined special events (annual bonus, tax refund, planned car
  // purchase, etc.). Indexed by year-month for fast monthly lookup.
  // 2026-05-04: replaces the previous hardcoded heuristic events
  // ("July=vacation", "June=bonus", etc.) which assumed every family the
  // same. Now the user enters their own from /goals → "אירועים מיוחדים".
  const specialEvents = loadSpecialEvents();
  const eventsByMonth = new Map<string, typeof specialEvents>();
  for (const ev of specialEvents) {
    const list = eventsByMonth.get(ev.ym) || [];
    list.push(ev);
    eventsByMonth.set(ev.ym, list);
  }

  // Build 12 months
  const out: ForecastMonth[] = [];
  const start = addMonths(new Date(), 1); // start next month
  let income = baseIncome;

  for (let i = 0; i < 12; i++) {
    const d = addMonths(start, i);
    const ym = ymOf(d);
    const label = `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const events: string[] = [];

    // Apply salary growth
    income *= 1 + monthlyGrowth;

    let expenses = baseExpenses;
    let monthIncome = income;

    // Drop mortgage payment if mortgage ended within this window
    if (mortgageMonthly > 0 && i + 1 >= mortgageMonthsLeft) {
      events.push(`✅ סיום משכנתא — ₪${Math.round(mortgageMonthly).toLocaleString()}/חודש מתפנה`);
      mortgageMonthly = 0; // future months: also no mortgage
    }

    // Drop loans that end this month. The original code surfaced the event
    // but never subtracted the freed-up payment from projected expenses, so
    // future months still looked tight even after a loan paid off. Now we
    // mirror the installment + mortgage pattern: from the ending month
    // onwards, reduce expenses by the loan's monthly amount.
    for (const ls of loanScheds) {
      if (ls.remainingPays > 0) {
        ls.remainingPays--;
        if (ls.remainingPays === 0 && ls.monthly > 0) {
          events.push(
            `✅ סיום הלוואה ${ls.lender} — ₪${Math.round(ls.monthly).toLocaleString()}/חודש מתפנה`
          );
          expenses -= ls.monthly;
        }
      } else if (ls.monthly > 0) {
        expenses -= ls.monthly;
      }
    }

    // Drop installments that end this month. Sum the relief into a single
    // running deduction so future months reflect the freed-up cashflow.
    for (const inst of installmentScheds) {
      if (inst.remainingPays > 0) {
        inst.remainingPays--;
        if (inst.remainingPays === 0 && inst.monthly > 0) {
          events.push(
            `✅ סיום ${inst.merchant} — ₪${Math.round(inst.monthly).toLocaleString()}/חודש מתפנה`
          );
          expenses -= inst.monthly;
        }
      } else if (inst.monthly > 0) {
        // Already-ended series — keep subtracting from baseExpenses every month
        // so the freed-up amount stays freed.
        expenses -= inst.monthly;
      }
    }

    // Recompute expenses considering mortgage already in baseExpenses;
    // when mortgage ends, subtract the saved amount from expenses going forward.
    if (mortgageMonthly === 0 && originalMortgageMonthly > 0) {
      expenses -= originalMortgageMonthly;
    }

    // Apply user-defined special events for this month.
    const monthSpecials = eventsByMonth.get(ym) || [];
    for (const ev of monthSpecials) {
      if (ev.type === "income") {
        monthIncome += ev.amount;
        events.push(`💰 ${ev.label} +₪${ev.amount.toLocaleString()}`);
      } else {
        expenses += ev.amount;
        events.push(`💸 ${ev.label} −₪${ev.amount.toLocaleString()}`);
      }
    }
    // Suppress unused-warning when annualGrowth isn't applied via bonus heuristic
    void annualGrowth;

    const netCashflow = Math.round(monthIncome - expenses);
    let status: ForecastMonth["status"] = "good";
    if (netCashflow < 0) status = "negative";
    else if (netCashflow < monthIncome * 0.05) status = "tight";

    out.push({
      ym,
      label,
      income: Math.round(monthIncome),
      expenses: Math.round(expenses),
      netCashflow,
      events,
      status,
    });
  }

  return out;
}
