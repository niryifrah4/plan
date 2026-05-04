/**
 * Verdant Ledger · Financial Math utilities
 * Pure functions — no DB, no React. Fully unit-testable.
 *
 * Includes: NPV, IRR (Newton-Raphson), Equity Multiple, Cash-on-Cash,
 * Mortgage PMT + schedule, Compound growth, Capital-gains tax (Israel).
 */

// ---------- Time-value-of-money -------------------------------------------

/** Net present value of a cashflow stream [CF0, CF1, …]. */
export function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

/**
 * Internal rate of return — Newton-Raphson with bisection fallback.
 * Returns NaN if no root found in [-0.99, 10].
 * `cashflows[0]` is typically a negative outflow (initial equity).
 */
export function irr(cashflows: number[], guess = 0.1, maxIter = 100): number {
  if (cashflows.length < 2) return NaN;

  // Newton-Raphson
  let r = guess;
  for (let i = 0; i < maxIter; i++) {
    let f = 0,
      df = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const d = Math.pow(1 + r, t);
      f += cashflows[t] / d;
      df += (-t * cashflows[t]) / (d * (1 + r));
    }
    if (Math.abs(df) < 1e-12) break;
    const rNext = r - f / df;
    if (!Number.isFinite(rNext)) break;
    if (Math.abs(rNext - r) < 1e-7) return rNext;
    r = rNext;
  }

  // Bisection fallback on [-0.99, 10]
  let lo = -0.99,
    hi = 10;
  let fLo = npv(lo, cashflows),
    fHi = npv(hi, cashflows);
  if (fLo * fHi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Future-value of lump + monthly contributions at annual rate `r`, over `years`. */
export function futureValue(
  lump: number,
  monthly: number,
  annualRate: number,
  years: number
): number {
  const r = annualRate / 12;
  const n = years * 12;
  const fvLump = lump * Math.pow(1 + r, n);
  const fvStream = r === 0 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r);
  return fvLump + fvStream;
}

// ---------- Mortgage -------------------------------------------------------

/** Monthly payment (PMT). Annual rate in decimal (e.g. 0.048 for 4.8%). */
export function pmt(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export interface AmortRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export function amortSchedule(principal: number, annualRate: number, months: number): AmortRow[] {
  const m = pmt(principal, annualRate, months);
  const r = annualRate / 12;
  const rows: AmortRow[] = [];
  let bal = principal;
  for (let i = 1; i <= months; i++) {
    const interest = bal * r;
    const pPart = m - interest;
    bal = Math.max(0, bal - pPart);
    rows.push({ month: i, payment: m, interest, principal: pPart, balance: bal });
  }
  return rows;
}

// ---------- Real-estate investment ----------------------------------------

export interface RealEstateInputs {
  purchasePrice: number; // מחיר הנכס
  downPayment: number; // הון עצמי
  closingCosts: number; // מס רכישה + עו"ד + תיווך
  mortgageRate: number; // 0.045 = 4.5%
  mortgageYears: number;
  monthlyRent: number;
  vacancyPct: number; // 0.05 = 5%
  monthlyExpenses: number; // ועד, ביטוח, תחזוקה, ניהול
  annualAppreciation: number; // 0.03 = 3%
  annualRentGrowth: number; // 0.02
  annualExpenseGrowth: number; // 0.02
  holdYears: number; // תקופת החזקה
  exitCostPct: number; // 0.07 = 7% (עלויות מכירה)
  taxOnSalePct: number; // 0.25 = מס שבח (על השבח הריאלי)
  /**
   * Optional — if provided, capital-gains tax is applied to the REAL gain
   * (nominal gain minus the inflation component of the basis), per Israeli
   * tax law. Omit for legacy nominal-gain behavior.
   * 0.025 = 2.5% annual inflation assumption.
   */
  inflationRate?: number;
}

export interface RealEstateOutputs {
  equityInvested: number;
  loanAmount: number;
  monthlyPMT: number;
  annualNOI: number; // Net Operating Income (pre-debt)
  monthlyCashflow: number; // NOI - PMT
  capRate: number; // NOI / purchasePrice
  cashOnCash: number; // annual cashflow / equity
  grossYield: number; // annual rent / purchasePrice
  netYield: number; // NOI / purchasePrice (same as capRate)
  exitValue: number;
  netProceedsOnExit: number;
  totalCashflowsRecv: number;
  totalProfit: number;
  equityMultiple: number;
  irr: number; // annual IRR
  cashflows: number[]; // yearly cashflow series (yr0 = -equity, yrN includes exit)
}

export function analyzeRealEstate(i: RealEstateInputs): RealEstateOutputs {
  const equity = i.downPayment + i.closingCosts;
  const loan = Math.max(0, i.purchasePrice - i.downPayment);
  const months = i.mortgageYears * 12;
  const monthlyPMT = loan > 0 ? pmt(loan, i.mortgageRate, months) : 0;

  // Year-1 figures
  const grossRentY1 = i.monthlyRent * 12 * (1 - i.vacancyPct);
  const expensesY1 = i.monthlyExpenses * 12;
  const noiY1 = grossRentY1 - expensesY1;
  const cfY1 = noiY1 - monthlyPMT * 12;

  // Yearly cashflows to investor (equity perspective)
  const cashflows: number[] = [-equity];
  let bal = loan;
  let rent = i.monthlyRent * 12 * (1 - i.vacancyPct);
  let exp = i.monthlyExpenses * 12;
  let totalCF = 0;

  for (let y = 1; y <= i.holdYears; y++) {
    const noi = rent - exp;
    // Amortise 12 months
    let principalPaid = 0;
    for (let m = 0; m < 12 && bal > 0; m++) {
      const interest = bal * (i.mortgageRate / 12);
      const pPart = Math.min(bal, monthlyPMT - interest);
      bal -= pPart;
      principalPaid += pPart;
    }
    const cf = noi - monthlyPMT * 12;
    totalCF += cf;
    if (y < i.holdYears) {
      cashflows.push(cf);
    } else {
      // Terminal year: cf + exit proceeds
      const exitValue = i.purchasePrice * Math.pow(1 + i.annualAppreciation, i.holdYears);
      const sellingCosts = exitValue * i.exitCostPct;
      // Basis = purchase price + closing costs (purchase tax + lawyer fees).
      // Closing costs raise the basis under Israeli מס שבח law, reducing taxable gain.
      const basis = i.purchasePrice + i.closingCosts;
      const nominalGain = exitValue - sellingCosts - basis;
      // Real gain = nominal minus inflation component of basis (Israeli tax law)
      const inflation = i.inflationRate ?? 0;
      const inflationComponent = basis * (Math.pow(1 + inflation, i.holdYears) - 1);
      const realGain = Math.max(0, nominalGain - inflationComponent);
      const saleTax = realGain * i.taxOnSalePct;
      const netProceeds = exitValue - sellingCosts - saleTax - bal;
      cashflows.push(cf + netProceeds);
    }
    rent *= 1 + i.annualRentGrowth;
    exp *= 1 + i.annualExpenseGrowth;
  }

  const exitValue = i.purchasePrice * Math.pow(1 + i.annualAppreciation, i.holdYears);
  const sellingCosts = exitValue * i.exitCostPct;
  // Basis includes closing costs (purchase tax + lawyer) per Israeli מס שבח.
  const basis = i.purchasePrice + i.closingCosts;
  const nominalGain = exitValue - sellingCosts - basis;
  const inflation = i.inflationRate ?? 0;
  const inflationComponent = basis * (Math.pow(1 + inflation, i.holdYears) - 1);
  const realGain = Math.max(0, nominalGain - inflationComponent);
  const saleTax = realGain * i.taxOnSalePct;
  // Balance at end of hold period (for netProceeds if not already computed above)
  const netProceeds = exitValue - sellingCosts - saleTax - bal;

  const totalProfit = totalCF + netProceeds - equity;
  const equityMultiple = equity > 0 ? (totalCF + netProceeds) / equity : 0;
  const irrAnnual = irr(cashflows);

  return {
    equityInvested: equity,
    loanAmount: loan,
    monthlyPMT,
    annualNOI: noiY1,
    monthlyCashflow: cfY1 / 12,
    capRate: noiY1 / i.purchasePrice,
    cashOnCash: cfY1 / equity,
    grossYield: (i.monthlyRent * 12) / i.purchasePrice,
    netYield: noiY1 / i.purchasePrice,
    exitValue,
    netProceedsOnExit: netProceeds,
    totalCashflowsRecv: totalCF,
    totalProfit,
    equityMultiple,
    irr: irrAnnual,
    cashflows,
  };
}

// ---------- Purchase Tax (מס רכישה) — Israel 2026 brackets ----------------
// Source: רשות המסים, מדרגות מס רכישה 2026. Update annually (around 16 Jan).

/** Investment / non-primary property — 8% / 10% from first shekel. */
const PURCHASE_TAX_BRACKETS_INVESTOR = [
  { limit: 6_055_070, rate: 0.08 },
  { limit: Infinity, rate: 0.1 },
];

/** Primary (single) residence — progressive, 0% until ~1.98M. */
const PURCHASE_TAX_BRACKETS_PRIMARY = [
  { limit: 1_978_745, rate: 0.0 },
  { limit: 2_347_040, rate: 0.035 },
  { limit: 6_055_070, rate: 0.05 },
  { limit: 20_183_565, rate: 0.08 },
  { limit: Infinity, rate: 0.1 },
];

function applyBrackets(price: number, brackets: { limit: number; rate: number }[]): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const taxable = Math.min(price, b.limit) - prev;
    if (taxable <= 0) break;
    tax += taxable * b.rate;
    prev = b.limit;
  }
  return tax;
}

/**
 * Calculate purchase tax (מס רכישה) in Israel.
 * @param price purchase price in ILS
 * @param kind  "primary" for single-home progressive brackets (0% → 10%)
 *              "investor" for non-primary / additional property (8% → 10%)
 * Defaults to "investor" for backward compatibility with existing callers.
 */
export function calcPurchaseTax(price: number, kind: "primary" | "investor" = "investor"): number {
  const brackets =
    kind === "primary" ? PURCHASE_TAX_BRACKETS_PRIMARY : PURCHASE_TAX_BRACKETS_INVESTOR;
  return applyBrackets(price, brackets);
}

/** Convenience: explicit primary-residence purchase tax. */
export function calcPurchaseTaxPrimary(price: number): number {
  return calcPurchaseTax(price, "primary");
}

// ---------- Capital Gains Tax (מס שבח) — Israel ---------------------------
// Real gain = nominal gain - inflation component. Taxed at 25% (post-2014
// reform; earlier portions may qualify for lower rates / exemptions — not
// modeled here, approximation for forecasting only).

export interface CapitalGainsInputs {
  purchasePrice: number;
  purchaseCosts?: number; // עלויות רכישה (עו"ד, תיווך, מס רכישה)
  improvements?: number; // השבחות מוכרות
  sellingPrice: number;
  sellingCosts?: number; // עלויות מכירה (תיווך, עו"ד)
  cpiAtPurchase: number; // מדד במועד רכישה
  cpiAtSale: number; // מדד במועד מכירה
}

export interface CapitalGainsOutputs {
  nominalGain: number;
  inflationComponent: number;
  realGain: number;
  tax: number; // 25% על השבח הריאלי
  effectiveRate: number; // tax / nominalGain
}

export function calcCapitalGainsTax(i: CapitalGainsInputs): CapitalGainsOutputs {
  const basis = i.purchasePrice + (i.purchaseCosts || 0) + (i.improvements || 0);
  const netProceeds = i.sellingPrice - (i.sellingCosts || 0);
  const nominalGain = Math.max(0, netProceeds - basis);

  // Inflation component = basis × (CPI_sale / CPI_purchase − 1)
  const cpiRatio = i.cpiAtPurchase > 0 ? i.cpiAtSale / i.cpiAtPurchase : 1;
  const inflationComponent = basis * Math.max(0, cpiRatio - 1);

  const realGain = Math.max(0, nominalGain - inflationComponent);
  const tax = realGain * 0.25;
  const effectiveRate = nominalGain > 0 ? tax / nominalGain : 0;

  return { nominalGain, inflationComponent, realGain, tax, effectiveRate };
}

// ---------- Savings & cashflow -------------------------------------------

/**
 * שיעור חיסכון — (הכנסות - הוצאות) / הכנסות
 * מחזיר שבר 0..1 (הכפל ב-100 לאחוזים).
 * אם ההכנסה ≤ 0 מחזיר 0.
 */
export function savingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return Math.max(0, (income - expenses) / income);
}

/**
 * חיסכון חודשי נטו — הכנסות פחות הוצאות.
 * ערכים שליליים חוקיים (גירעון).
 */
export function monthlyNetSavings(income: number, expenses: number): number {
  return income - expenses;
}

/**
 * תשואה שנתית ממוצעת (CAGR) מ-startValue ל-endValue על פני years שנים.
 * אם startValue ≤ 0 או years ≤ 0 מחזיר 0.
 */
export function cagr(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Future Value — השקעה חודשית קבועה על פני n חודשים בריבית חודשית rMonthly.
 * (FV של annuity רגיל, תשלום בסוף כל חודש.)
 */
export function futureValueMonthly(monthly: number, rMonthly: number, n: number): number {
  if (n <= 0) return 0;
  if (rMonthly === 0) return monthly * n;
  return monthly * ((Math.pow(1 + rMonthly, n) - 1) / rMonthly);
}

/**
 * המרת ריבית שנתית (עשרונית) לריבית חודשית שקולה.
 * דוגמה: 0.06 → ~0.004868
 */
export function annualToMonthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/**
 * יחס חוב-להכנסה (DTI) — תשלום חודשי / הכנסה חודשית.
 * אם ההכנסה ≤ 0 מחזיר 0.
 */
export function debtToIncome(monthlyDebtPayment: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return 0;
  return Math.max(0, monthlyDebtPayment) / monthlyIncome;
}

/**
 * קרן חירום — כמה חודשי הוצאות מכוסים ע"י הסכום הנזיל.
 * אם ההוצאות החודשיות ≤ 0 מחזיר 0.
 */
export function emergencyFundMonths(liquid: number, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return 0;
  return Math.max(0, liquid) / monthlyExpenses;
}

// ---------- Israeli Capital-Gains Tax simulator ---------------------------

/**
 * Estimate capital-gains tax on securities (Israel, 2024-2026 rules).
 *  - Nominal CGT: 25% on real gain; 30% if "substantial shareholder" (≥10%).
 *  - Linear method for pre-2003 holdings is out-of-scope here.
 */
export function capitalGainsTax(
  costBasisIls: number,
  marketValueIls: number,
  opts: { substantial?: boolean } = {}
): { gain: number; tax: number; netAfterTax: number } {
  const gain = Math.max(0, marketValueIls - costBasisIls);
  const rate = opts.substantial ? 0.3 : 0.25;
  const tax = gain * rate;
  return { gain, tax, netAfterTax: marketValueIls - tax };
}
