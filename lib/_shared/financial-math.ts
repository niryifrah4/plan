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
  // Edge case guards (finance-agent 2026-05-21):
  //   - months ≤ 0: pmt() would divide by zero / return Infinity. Return empty.
  //   - principal ≤ 0: nothing to schedule.
  if (!isFinite(principal) || principal <= 0) return [];
  if (!isFinite(months) || months <= 0) return [];

  const m = pmt(principal, annualRate, months);
  const r = annualRate / 12;
  const rows: AmortRow[] = [];
  let bal = principal;
  for (let i = 1; i <= months; i++) {
    const interest = bal * r;
    // Payment-below-interest guard: when the user enters an unrealistically
    // high rate (e.g. 50%+ on a 30-year loan), `pmt` may still produce a
    // payment that barely exceeds interest. The original Math.max(0, ...)
    // would silently let the balance creep upward. Force termination if the
    // payment doesn't actually reduce principal.
    const pPart = m - interest;
    if (pPart <= 0) {
      // Capture the bad row so the UI can show what happened, then bail.
      rows.push({ month: i, payment: m, interest, principal: pPart, balance: bal });
      break;
    }
    bal = Math.max(0, bal - pPart);
    rows.push({ month: i, payment: m, interest, principal: pPart, balance: bal });
    if (bal <= 0) break;
  }
  return rows;
}

// ---------- CPI-aware mortgage projection (Israeli "צמוד מדד") ----------
//
// In an Israeli CPI-linked mortgage, the principal balance is reindexed to
// the consumer price index every month, and the payment grows in lockstep so
// the loan is still amortized over its original term in real terms. The
// stated rate is the REAL rate — the nominal cost is higher because the
// balance and the payments both grow with CPI over the loan's life.
//
// The Fisher equation captures the relation:
//   (1 + nominal) = (1 + real) × (1 + cpi)
//
// Use `effectiveNominalRate` to show couples why a "low" 2.5% indexed rate
// can cost more than a 5% fixed rate over 25 years. Use `projectIndexedLoan`
// for forward simulations (interestRemaining KPI, cashflow forecast, refi
// break-even).

/**
 * Effective nominal annual rate, given a real rate and CPI assumption.
 * Both inputs are decimal fractions (0.025 = 2.5%). For non-indexed tracks
 * pass `cpiRate = 0` and the function returns `realRate` unchanged.
 */
export function effectiveNominalRate(realRate: number, cpiRate: number = 0): number {
  return (1 + realRate) * (1 + cpiRate) - 1;
}

export interface IndexedProjection {
  /** Months until the balance reaches zero (capped at maxMonths). */
  monthsRemaining: number;
  /** Sum of all future payments in nominal shekels. */
  totalCostNominal: number;
  /** Nominal interest paid over remaining life = totalCost − currentBalance. */
  totalInterestNominal: number;
  /** True if the simulator hit `maxMonths` without amortizing — a "stuck" loan
   *  whose payment doesn't even cover monthly interest at the given rate. */
  cappedAtMax: boolean;
}

/**
 * Forward-project a (possibly CPI-linked) mortgage track.
 *
 * Non-indexed track: pass `annualCpi = 0` and the function uses the standard
 * closed-form solver. Identical to the legacy `interestRemaining` math.
 *
 * Indexed track: pass the assumed annual CPI. The function simulates month
 * by month — balance grows by CPI before interest accrues, and the monthly
 * payment grows with CPI too (Israeli "תשלום צמוד" convention). The total
 * cost is nominal (what the family will actually pay in future shekels).
 *
 * @param balance        Current outstanding principal (₪).
 * @param monthlyPayment Current monthly payment (₪, already CPI-adjusted to today).
 * @param annualRate     Real annual rate as a DECIMAL fraction (0.025 = 2.5%).
 * @param annualCpi      Assumed annual CPI as a DECIMAL fraction (0.025 = 2.5%).
 *                       Pass 0 for non-indexed tracks.
 * @param maxMonths      Safety cap to avoid infinite loops (default 600 = 50 yrs).
 */
export function projectIndexedLoan(
  balance: number,
  monthlyPayment: number,
  annualRate: number,
  annualCpi: number = 0,
  maxMonths: number = 600
): IndexedProjection {
  if (balance <= 0 || monthlyPayment <= 0) {
    return { monthsRemaining: 0, totalCostNominal: 0, totalInterestNominal: 0, cappedAtMax: false };
  }
  const r = annualRate / 12;
  const c = annualCpi / 12;

  // Closed-form for the non-indexed case — fast and exact.
  if (c === 0) {
    if (r === 0) {
      const months = Math.ceil(balance / monthlyPayment);
      const cost = months * monthlyPayment;
      return {
        monthsRemaining: months,
        totalCostNominal: cost,
        totalInterestNominal: Math.max(0, cost - balance),
        cappedAtMax: false,
      };
    }
    const ratio = (balance * r) / monthlyPayment;
    if (ratio >= 1) {
      // Payment doesn't cover monthly interest — loan never amortizes.
      const cost = maxMonths * monthlyPayment;
      return {
        monthsRemaining: maxMonths,
        totalCostNominal: cost,
        totalInterestNominal: Math.max(0, cost - balance),
        cappedAtMax: true,
      };
    }
    const months = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
    const cost = months * monthlyPayment;
    return {
      monthsRemaining: months,
      totalCostNominal: cost,
      totalInterestNominal: Math.max(0, cost - balance),
      cappedAtMax: false,
    };
  }

  // CPI-linked: month-by-month simulation. Balance is reindexed up by CPI,
  // interest accrues on the reindexed balance, payment subtracted, and the
  // payment itself grows by CPI for next month.
  let bal = balance;
  let pmtNow = monthlyPayment;
  let totalCost = 0;
  let months = 0;
  for (let m = 1; m <= maxMonths; m++) {
    bal = bal * (1 + c);
    const interest = bal * r;
    bal = bal + interest - pmtNow;
    totalCost += pmtNow;
    months = m;
    if (bal <= 0) break;
    pmtNow = pmtNow * (1 + c);
  }
  const cappedAtMax = months >= maxMonths && bal > 0;
  return {
    monthsRemaining: months,
    totalCostNominal: totalCost,
    totalInterestNominal: Math.max(0, totalCost - balance),
    cappedAtMax,
  };
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

// ---------- Early Repayment Fee (עמלת פירעון מוקדם) — Israel ─────────────
// Banks charge a discount-component fee when you prepay or refinance a
// FIXED-RATE mortgage track. Formula (simplified):
//
//   discount = max(0, PV(payments @ trackRate) − PV(payments @ marketRate))
//
// Plus minor fixed fees (operational + non-notice).
//
// Indexation/foreign-currency tracks add further components (CPI gap, FX gap)
// that are NOT modeled here — surfacing those would require live CPI data.
// Prime-linked tracks have ZERO discount fee (rate is variable).
//
// 2026-05-18 per Nir: replaces the previous flat ₪1,500 placeholder. Reference:
// תקנות הבנקאות (עמלות פירעון מוקדם), 2002 (with later amendments).

export type RepaymentFeeIndexation =
  | "fixed-unlinked" // קל"צ — full discount fee applies
  | "fixed-linked" // ק"צ — discount fee applies (CPI gap omitted, conservative)
  | "variable-period" // ריבית משתנה כל X שנים — fee only between change dates
  | "prime" // פריים — no discount fee
  | "other"; // unknown — calculator returns operational fee only

export interface EarlyRepaymentFeeInputs {
  /** Remaining principal balance in ₪. */
  remainingBalance: number;
  /** Current monthly payment in ₪. */
  monthlyPayment: number;
  /** Track's annual interest rate as a fraction (0.048 = 4.8%). */
  trackRate: number;
  /** Bank-of-Israel average mortgage rate (fraction). When trackRate ≤
   *  marketRate, the discount fee is zero — refinancing is "free" of this fee. */
  marketRate: number;
  /** Track type — determines whether the discount fee applies. */
  indexation: RepaymentFeeIndexation;
  /** Provide notice ≥ 10 days before prepayment to skip the "no notice" fee. */
  gaveNotice?: boolean;
  /**
   * For "variable-period" tracks: months until the next change date.
   * If 0 or negative, the discount fee is waived (we're at a change date).
   */
  monthsToNextChange?: number;
}

export interface EarlyRepaymentFeeOutputs {
  /** Discount-component fee (the main one). */
  discountFee: number;
  /** Operational flat fee (~₪60). */
  operationalFee: number;
  /** Fee for not giving 10-day advance notice. */
  noNoticeFee: number;
  /** Total = sum of all. */
  total: number;
  /** Breakdown of remaining months used in the discount calc. */
  monthsRemaining: number;
  /** PV at the track's rate (the "what you owe today" baseline). */
  pvAtTrackRate: number;
  /** PV at the market rate (what the bank could lend out today). */
  pvAtMarketRate: number;
}

/** Compute remaining months from balance, monthly payment, annual rate. */
function solveRemainingMonths(balance: number, monthly: number, annualRate: number): number {
  if (balance <= 0 || monthly <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(balance / monthly);
  const ratio = (balance * r) / monthly;
  if (ratio >= 1) return 600; // payment doesn't even cover interest — capped
  if (ratio <= 0) return 0;
  return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
}

/** Present value of N equal monthly payments at annual rate `rate`. */
function pvOfPayments(monthly: number, months: number, annualRate: number): number {
  if (monthly <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return monthly * months;
  return (monthly * (1 - Math.pow(1 + r, -months))) / r;
}

const OPERATIONAL_FEE = 60; // ₪ — תעריפון בנקאי טיפוסי

export function calcEarlyRepaymentFee(i: EarlyRepaymentFeeInputs): EarlyRepaymentFeeOutputs {
  const monthsRemaining = solveRemainingMonths(
    i.remainingBalance,
    i.monthlyPayment,
    i.trackRate
  );

  const operationalFee = OPERATIONAL_FEE;
  const noNoticeFee = i.gaveNotice === false ? Math.round((i.monthlyPayment * 10) / 30) : 0;

  // Prime tracks — no discount fee
  if (i.indexation === "prime" || i.indexation === "other") {
    return {
      discountFee: 0,
      operationalFee,
      noNoticeFee,
      total: operationalFee + noNoticeFee,
      monthsRemaining,
      pvAtTrackRate: i.remainingBalance,
      pvAtMarketRate: i.remainingBalance,
    };
  }

  // Variable-period tracks — fee waived at change date
  if (
    i.indexation === "variable-period" &&
    typeof i.monthsToNextChange === "number" &&
    i.monthsToNextChange <= 0
  ) {
    return {
      discountFee: 0,
      operationalFee,
      noNoticeFee,
      total: operationalFee + noNoticeFee,
      monthsRemaining,
      pvAtTrackRate: i.remainingBalance,
      pvAtMarketRate: i.remainingBalance,
    };
  }

  // Discount-component fee
  const pvAtTrackRate = pvOfPayments(i.monthlyPayment, monthsRemaining, i.trackRate);
  const pvAtMarketRate = pvOfPayments(i.monthlyPayment, monthsRemaining, i.marketRate);
  const discountFee = Math.max(0, Math.round(pvAtTrackRate - pvAtMarketRate));

  return {
    discountFee,
    operationalFee,
    noNoticeFee,
    total: discountFee + operationalFee + noNoticeFee,
    monthsRemaining,
    pvAtTrackRate: Math.round(pvAtTrackRate),
    pvAtMarketRate: Math.round(pvAtMarketRate),
  };
}

/** Map a free-text indexation label (as stored on MortgageTrack) to the
 *  enum used by the fee calculator. Conservative: anything unknown → "other"
 *  which yields the operational fee only. */
export function inferRepaymentFeeIndexation(
  indexationLabel: string,
  trackName?: string
): RepaymentFeeIndexation {
  const name = (trackName || "").toLowerCase();
  // Prime tracks
  if (name.includes("פריים") || name.includes("prime")) return "prime";
  // Variable-period tracks (e.g. "משתנה כל 5", "משתנה כל 10")
  if (name.includes("משתנה")) return "variable-period";
  // Fixed-rate tracks — distinguish indexed (ק"צ) vs unlinked (קל"צ)
  if (name.includes("קל\"צ") || name.includes("קלצ") || name.includes("קל''צ")) return "fixed-unlinked";
  if (name.includes("ק\"צ") || name.includes("קצ") || name.includes("ק''צ")) return "fixed-linked";
  // Fall back to indexation field
  if (indexationLabel === "לא צמוד") return "fixed-unlinked";
  if (indexationLabel === "מדד") return "fixed-linked";
  return "other";
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
