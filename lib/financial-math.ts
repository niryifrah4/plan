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
    let f = 0, df = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const d = Math.pow(1 + r, t);
      f  += cashflows[t] / d;
      df += -t * cashflows[t] / (d * (1 + r));
    }
    if (Math.abs(df) < 1e-12) break;
    const rNext = r - f / df;
    if (!Number.isFinite(rNext)) break;
    if (Math.abs(rNext - r) < 1e-7) return rNext;
    r = rNext;
  }

  // Bisection fallback on [-0.99, 10]
  let lo = -0.99, hi = 10;
  let fLo = npv(lo, cashflows), fHi = npv(hi, cashflows);
  if (fLo * fHi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
    else                { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

/** Future-value of lump + monthly contributions at annual rate `r`, over `years`. */
export function futureValue(lump: number, monthly: number, annualRate: number, years: number): number {
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
  purchasePrice: number;     // מחיר הנכס
  downPayment: number;       // הון עצמי
  closingCosts: number;      // מס רכישה + עו"ד + תיווך
  mortgageRate: number;      // 0.045 = 4.5%
  mortgageYears: number;
  monthlyRent: number;
  vacancyPct: number;        // 0.05 = 5%
  monthlyExpenses: number;   // ועד, ביטוח, תחזוקה, ניהול
  annualAppreciation: number;// 0.03 = 3%
  annualRentGrowth: number;  // 0.02
  annualExpenseGrowth: number;// 0.02
  holdYears: number;         // תקופת החזקה
  exitCostPct: number;       // 0.07 = 7% (עלויות מכירה)
  taxOnSalePct: number;      // 0.25 = מס שבח / רווח הון
}

export interface RealEstateOutputs {
  equityInvested: number;
  loanAmount: number;
  monthlyPMT: number;
  annualNOI: number;         // Net Operating Income (pre-debt)
  monthlyCashflow: number;   // NOI - PMT
  capRate: number;           // NOI / purchasePrice
  cashOnCash: number;        // annual cashflow / equity
  grossYield: number;        // annual rent / purchasePrice
  netYield: number;          // NOI / purchasePrice (same as capRate)
  exitValue: number;
  netProceedsOnExit: number;
  totalCashflowsRecv: number;
  totalProfit: number;
  equityMultiple: number;
  irr: number;               // annual IRR
  cashflows: number[];       // yearly cashflow series (yr0 = -equity, yrN includes exit)
}

export function analyzeRealEstate(i: RealEstateInputs): RealEstateOutputs {
  const equity = i.downPayment + i.closingCosts;
  const loan = Math.max(0, i.purchasePrice - i.downPayment);
  const months = i.mortgageYears * 12;
  const monthlyPMT = loan > 0 ? pmt(loan, i.mortgageRate, months) : 0;

  // Year-1 figures
  const grossRentY1 = i.monthlyRent * 12 * (1 - i.vacancyPct);
  const expensesY1  = i.monthlyExpenses * 12;
  const noiY1       = grossRentY1 - expensesY1;
  const cfY1        = noiY1 - monthlyPMT * 12;

  // Yearly cashflows to investor (equity perspective)
  const cashflows: number[] = [-equity];
  let bal = loan;
  let rent = i.monthlyRent * 12 * (1 - i.vacancyPct);
  let exp  = i.monthlyExpenses * 12;
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
      const gain = exitValue - sellingCosts - i.purchasePrice;
      const saleTax = Math.max(0, gain) * i.taxOnSalePct;
      const netProceeds = exitValue - sellingCosts - saleTax - bal;
      cashflows.push(cf + netProceeds);
    }
    rent *= 1 + i.annualRentGrowth;
    exp  *= 1 + i.annualExpenseGrowth;
  }

  const exitValue = i.purchasePrice * Math.pow(1 + i.annualAppreciation, i.holdYears);
  const sellingCosts = exitValue * i.exitCostPct;
  const gain = exitValue - sellingCosts - i.purchasePrice;
  const saleTax = Math.max(0, gain) * i.taxOnSalePct;
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

// ---------- Israeli Capital-Gains Tax simulator ---------------------------

/**
 * Estimate capital-gains tax on securities (Israel, 2024-2026 rules).
 *  - Nominal CGT: 25% on real gain; 30% if "substantial shareholder" (≥10%).
 *  - Linear method for pre-2003 holdings is out-of-scope here.
 */
export function capitalGainsTax(
  costBasisIls: number,
  marketValueIls: number,
  opts: { substantial?: boolean } = {},
): { gain: number; tax: number; netAfterTax: number } {
  const gain = Math.max(0, marketValueIls - costBasisIls);
  const rate = opts.substantial ? 0.30 : 0.25;
  const tax = gain * rate;
  return { gain, tax, netAfterTax: marketValueIls - tax };
}
