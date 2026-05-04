/**
 * Life Coverage Engine — "גרף החיים" + "מדד פלאן"
 * Built 2026-05-03 per Nir's brief: copy + improve Plangram's flagship
 * visualization (single chart that shows all of life's financial picture
 * in one view, with red zones where goals won't be met).
 *
 * Output:
 *   - series:        year-by-year [age, netWorth, goalsCost, gap, surplus]
 *   - missingPiece:  total PV of unmet goals (the "red" total)
 *   - surplusPiece:  PV of idle cash above safety reserve (the "green" total)
 *   - planScore:     0–100 single number — coverage + savings + debt + emergency
 *   - retirementYear / endYear: chart bounds
 *
 * The math is intentionally conservative — we project ONE deterministic
 * trajectory (no Monte-Carlo). Users get a clear picture, not a probability
 * distribution. Phase 2 can add scenario manager + sensitivity bands.
 */

import { loadAssumptions } from "./assumptions";
import { loadBuckets } from "./buckets-store";
import { loadDebtData } from "./debt-store";
import { loadAccounts, totalBankBalance } from "./accounts-store";
import { loadPensionFunds } from "./pension-store";
import { loadSecurities, totalSecuritiesValue } from "./securities-store";
import { loadProperties } from "./realestate-store";

/** One row in the life chart (one calendar year). */
export interface LifeYearPoint {
  year: number;
  age: number;
  /** Projected net worth at end of this year (positive only; clamped at 0). */
  netWorth: number;
  /** Sum of goals due THIS year (lump sums hitting in this calendar year). */
  goalsCost: number;
  /** True if a goal due this year couldn't be funded by NW + that year's saving. */
  gapThisYear: boolean;
  /** Magnitude of the unfunded portion this year (₪, undiscounted). */
  gapAmount: number;
  /** Years from today (0 = current year). Used for PV discounting. */
  yearsFromNow: number;
  /** True for the retirement year specifically (highlight). */
  isRetirement: boolean;
}

export interface LifeCoverage {
  series: LifeYearPoint[];
  /** Sum of PV of all gaps — the "missing piece" (₪, today's money). */
  missingPiece: number;
  /** Idle cash above 6-month emergency reserve — "surplus piece" (₪). */
  surplusPiece: number;
  /** 0–100. Higher is better. */
  planScore: number;
  /** Breakdown of the score so the UI can show "what's costing you points". */
  scoreBreakdown: {
    goalCoverage: number; // 0–50
    savingsRate: number; // 0–20
    debtBurden: number; // 0–15
    emergencyFund: number; // 0–15
  };
  /** Calendar year of retirement. */
  retirementYear: number;
  /** Last year of the projection (= current age + 50). */
  endYear: number;
  /** Net worth today (start of chart). */
  startNetWorth: number;
  /** Total funded (PV) across all goals — for the "covered piece" stat. */
  coveredPiece: number;
  /** Total goals cost (PV). missingPiece + coveredPiece = goalsTotal. */
  goalsTotal: number;
}

/** Discount a future ₪ amount to today using the risk-free rate. */
function pv(amount: number, years: number, discountRate: number): number {
  if (years <= 0) return amount;
  return amount / Math.pow(1 + discountRate, years);
}

export function buildLifeCoverage(): LifeCoverage {
  // SSR safety
  if (typeof window === "undefined") {
    return {
      series: [],
      missingPiece: 0,
      surplusPiece: 0,
      planScore: 0,
      scoreBreakdown: { goalCoverage: 0, savingsRate: 0, debtBurden: 0, emergencyFund: 0 },
      retirementYear: new Date().getFullYear() + 25,
      endYear: new Date().getFullYear() + 50,
      startNetWorth: 0,
      coveredPiece: 0,
      goalsTotal: 0,
    };
  }

  const a = loadAssumptions();
  const buckets = loadBuckets();
  const debt = loadDebtData();
  const accounts = loadAccounts();
  const pensions = loadPensionFunds();
  const securities = loadSecurities();
  const properties = loadProperties();

  const currentYear = new Date().getFullYear();
  const currentAge = a.currentAge || 35;
  const retirementAge = a.retirementAge || 67;
  const endAge = Math.min(95, currentAge + 50);
  const retirementYear = currentYear + Math.max(0, retirementAge - currentAge);
  const endYear = currentYear + (endAge - currentAge);
  const discountRate = a.riskFreeRate || a.boiRate || 0.04;

  // ── Starting position ─────────────────────────────────────
  const cash = totalBankBalance(accounts);
  const securitiesValue = totalSecuritiesValue(securities);
  const pensionValue = pensions.reduce((s, f) => s + (f.balance || 0), 0);
  const reValue = properties.reduce((s, p) => s + (p.currentValue || 0), 0);
  const mortgageBalance = (debt.mortgage?.tracks || []).reduce(
    (s, t) => s + (t.remainingBalance || 0),
    0
  );
  const otherDebt = (debt.loans || []).reduce(
    (s, l) => s + (l.totalPayments || 0) * (l.monthlyPayment || 0) * 0.5,
    0
  );
  const liabilities = mortgageBalance + otherDebt;

  const startNetWorth = Math.max(0, cash + securitiesValue + pensionValue + reValue - liabilities);

  // ── Cashflow inputs ───────────────────────────────────────
  const monthlyIncome = a.monthlyIncome || 0;
  const monthlyExpenses = a.monthlyExpenses || 0;
  const annualSavings = Math.max(0, (monthlyIncome - monthlyExpenses) * 12);
  const annualReturn = ((a.expectedReturnPension || 0.05) + (a.expectedReturnInvest || 0.07)) / 2;
  const reAppreciation = 0.025;
  const salaryGrowth = a.salaryGrowthRate || 0.02;

  // ── Goals indexed by year ─────────────────────────────────
  // Each lump-sum goal hits its target year. Recurring goals not modeled
  // here yet — phase 2.
  const goalsByYear = new Map<number, number>();
  let goalsTotalPV = 0;
  for (const b of buckets) {
    if (b.archived || !b.targetDate || !b.targetAmount) continue;
    const yr = new Date(b.targetDate).getFullYear();
    if (yr < currentYear || yr > endYear) continue;
    const remaining = Math.max(0, (b.targetAmount || 0) - (b.currentAmount || 0));
    if (remaining <= 0) continue;
    goalsByYear.set(yr, (goalsByYear.get(yr) || 0) + remaining);
    goalsTotalPV += pv(remaining, yr - currentYear, discountRate);
  }

  // ── Year-by-year simulation ───────────────────────────────
  const series: LifeYearPoint[] = [];
  let nw = startNetWorth;
  let yearlyIncome = monthlyIncome * 12;
  let yearlyExpenses = monthlyExpenses * 12;
  let missingPV = 0;

  for (let y = currentYear; y <= endYear; y++) {
    const age = currentAge + (y - currentYear);
    const isRetired = age >= retirementAge;

    // Apply growth on existing balance + RE appreciation portion
    nw = nw * (1 + annualReturn * 0.6) + reValue * reAppreciation;

    // Add savings while working; deduct expenses (drawdown) in retirement
    if (!isRetired) {
      nw += Math.max(0, yearlyIncome - yearlyExpenses);
      yearlyIncome *= 1 + salaryGrowth;
    } else {
      // Retirement: pension + Bituach Leumi roughly cover ~70% of expenses
      const pensionIncome =
        (a.oldAgeAllowanceMonthly || 4500) * 12 + pensionValue * (a.safeWithdrawalRate || 0.04);
      nw += pensionIncome - yearlyExpenses;
    }

    // Goal hits this year
    const goalsCost = goalsByYear.get(y) || 0;
    let gapThisYear = false;
    let gapAmount = 0;
    if (goalsCost > 0) {
      if (nw >= goalsCost) {
        nw -= goalsCost;
      } else {
        gapAmount = goalsCost - nw;
        gapThisYear = true;
        missingPV += pv(gapAmount, y - currentYear, discountRate);
        nw = 0;
      }
    }

    // Don't let NW go negative (can't borrow infinitely)
    if (nw < 0) {
      missingPV += pv(-nw, y - currentYear, discountRate);
      nw = 0;
    }

    series.push({
      year: y,
      age,
      netWorth: Math.round(nw),
      goalsCost: Math.round(goalsCost),
      gapThisYear,
      gapAmount: Math.round(gapAmount),
      yearsFromNow: y - currentYear,
      isRetirement: y === retirementYear,
    });
  }

  // ── Surplus piece ─────────────────────────────────────────
  // Idle cash above 6 months of expenses = under-deployed capital.
  const emergencyReserve = monthlyExpenses * 6;
  const idleCash = Math.max(0, cash - emergencyReserve);
  const surplusPiece = Math.round(idleCash);

  // ── Plan Score 0–100 ──────────────────────────────────────
  // 50 pts: goal coverage (1 - missing/total)
  // 20 pts: savings rate
  // 15 pts: debt burden (debt service / income)
  // 15 pts: emergency fund (>= 3 months expenses)
  const coverage = goalsTotalPV > 0 ? Math.max(0, 1 - missingPV / goalsTotalPV) : 1; // no goals = full coverage
  const goalCoveragePts = Math.round(50 * coverage);

  const savingsRatio = monthlyIncome > 0 ? (monthlyIncome - monthlyExpenses) / monthlyIncome : 0;
  const savingsPts = Math.round(20 * Math.max(0, Math.min(1, savingsRatio / 0.25))); // cap at 25%

  const monthlyDebtService =
    (debt.mortgage?.tracks || []).reduce((s, t) => s + (t.monthlyPayment || 0), 0) +
    (debt.loans || []).reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const debtRatio = monthlyIncome > 0 ? monthlyDebtService / monthlyIncome : 0;
  // 15 pts at 0% debt, 0 pts at 40%+ debt-to-income
  const debtPts = Math.round(15 * Math.max(0, Math.min(1, 1 - debtRatio / 0.4)));

  const emergencyMonths = monthlyExpenses > 0 ? cash / monthlyExpenses : 0;
  // 15 pts at >=3 months, scaled down below
  const emergencyPts = Math.round(15 * Math.max(0, Math.min(1, emergencyMonths / 3)));

  const planScore = Math.max(
    0,
    Math.min(100, goalCoveragePts + savingsPts + debtPts + emergencyPts)
  );

  return {
    series,
    missingPiece: Math.round(missingPV),
    surplusPiece,
    planScore,
    scoreBreakdown: {
      goalCoverage: goalCoveragePts,
      savingsRate: savingsPts,
      debtBurden: debtPts,
      emergencyFund: emergencyPts,
    },
    retirementYear,
    endYear,
    startNetWorth: Math.round(startNetWorth),
    coveredPiece: Math.round(goalsTotalPV - missingPV),
    goalsTotal: Math.round(goalsTotalPV),
  };
}
