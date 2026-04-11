/**
 * Verdant Ledger · Global Assumptions Engine
 * Central store for dynamic financial assumptions used across all calculators.
 * Persisted to localStorage — any page can read/update these values.
 */

const STORAGE_KEY = "verdant:assumptions";

export interface Assumptions {
  inflationRate: number;       // e.g. 0.025 = 2.5%
  managementFeePension: number;// e.g. 0.005 = 0.5%
  managementFeeInvest: number; // e.g. 0.008 = 0.8%
  expectedReturnPension: number; // e.g. 0.05
  expectedReturnInvest: number;  // e.g. 0.065
  expectedReturnSP500: number;   // e.g. 0.10
  riskFreeRate: number;          // e.g. 0.04
  safeWithdrawalRate: number;    // e.g. 0.04 (Rule of 300 → 1/300 monthly)
  retirementAge: number;         // e.g. 67
  currentAge: number;            // e.g. 42
  monthlyIncome: number;         // gross monthly
  monthlyExpenses: number;       // average monthly
  monthlyInvestment: number;     // total monthly savings/investment
  salaryGrowthRate: number;      // e.g. 0.03 = 3% annual salary growth
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflationRate: 0.025,          // 2.5% — reset default
  managementFeePension: 0.005,
  managementFeeInvest: 0.008,
  expectedReturnPension: 0.05,
  expectedReturnInvest: 0.07,    // 7% — market average
  expectedReturnSP500: 0.10,
  riskFreeRate: 0.04,
  safeWithdrawalRate: 0.04,
  retirementAge: 67,
  currentAge: 42,
  monthlyIncome: 28500,
  monthlyExpenses: 27000,
  monthlyInvestment: 5600,
  salaryGrowthRate: 0.03,
};

/** Read assumptions from localStorage (merge with defaults). */
export function loadAssumptions(): Assumptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_ASSUMPTIONS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_ASSUMPTIONS };
}

/** Save assumptions to localStorage. Dispatches storage event for cross-tab sync. */
export function saveAssumptions(a: Assumptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    window.dispatchEvent(new Event("verdant:assumptions"));
  } catch {}
}

/** Patch specific fields. */
export function patchAssumptions(patch: Partial<Assumptions>): Assumptions {
  const current = loadAssumptions();
  const updated = { ...current, ...patch };
  saveAssumptions(updated);
  return updated;
}

// ─── Derived Metrics ───

/** Leverage ratio = Total Liabilities / Total Assets × 100 */
export function leverageRatio(totalLiabilities: number, totalAssets: number): number {
  return totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
}

/** Savings ratio = Monthly Investment / Monthly Income × 100 */
export function savingsRatio(monthlyInvestment: number, monthlyIncome: number): number {
  return monthlyIncome > 0 ? (monthlyInvestment / monthlyIncome) * 100 : 0;
}

/** Freedom number = Monthly Expenses × 300 (inverse of 4% SWR) */
export function freedomNumber(monthlyExpenses: number): number {
  return monthlyExpenses * 300;
}

/** Real return = Nominal return - Inflation - Management fees */
export function realReturn(nominal: number, inflation: number, fees: number): number {
  return nominal - inflation - fees;
}

/**
 * Israeli marginal income tax brackets (2025-2026).
 * Returns { tax, effectiveRate, marginalBracket }.
 */
export function israeliIncomeTax(annualIncome: number): {
  tax: number;
  effectiveRate: number;
  marginalBracket: number;
} {
  const brackets = [
    { limit:  84120, rate: 0.10 },
    { limit: 120720, rate: 0.14 },
    { limit: 193800, rate: 0.20 },
    { limit: 269280, rate: 0.31 },
    { limit: 560280, rate: 0.35 },
    { limit: 721560, rate: 0.47 },
    { limit: Infinity, rate: 0.50 },
  ];

  let remaining = annualIncome;
  let totalTax = 0;
  let marginalBracket = 0.10;
  let prev = 0;

  for (const b of brackets) {
    const taxable = Math.min(remaining, b.limit - prev);
    if (taxable <= 0) break;
    totalTax += taxable * b.rate;
    marginalBracket = b.rate;
    remaining -= taxable;
    prev = b.limit;
  }

  return {
    tax: totalTax,
    effectiveRate: annualIncome > 0 ? totalTax / annualIncome : 0,
    marginalBracket,
  };
}

/**
 * Basic Bituach Leumi (National Insurance) estimate for employee.
 * Simplified: 3.5% up to 60% of avg wage, 12% above, capped at 5× avg wage.
 */
export function bituachLeumiEstimate(monthlyGross: number): {
  monthly: number;
  annual: number;
} {
  const avgWage = 12536; // Updated average wage 2025
  const low = Math.min(monthlyGross, avgWage * 0.6);
  const high = Math.max(0, Math.min(monthlyGross, avgWage * 5) - avgWage * 0.6);
  const monthly = low * 0.035 + high * 0.12;
  return { monthly, annual: monthly * 12 };
}
