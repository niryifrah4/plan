/**
 * Pension fund simulator — per-fund what-if math.
 *
 * Built 2026-04-28 per Nir: "אני צריך שתהיה לי אפשרות לעשות סימולציה על
 * כל קופה בנפרד". Light formula (FV of annuity-due) — no need for the
 * full FIRE trajectory engine when we're playing with one fund's params.
 */

import type { PensionFund } from "./pension-store";

export interface SimInputs {
  /** Annual gross return % the user expects (slider, default from track). */
  expectedReturnPct: number;
  /** Annual fee on balance %, e.g. 0.5 = ½ of a percent. */
  mgmtFeeBalancePct: number;
  /** Monthly contribution (₪). */
  monthlyContrib: number;
  /** Years until retirement. */
  yearsToRetirement: number;
  /** Conversion factor — 200 for קרן פנסיה, 175 for ביטוח מנהלים, etc.
   *  Higher → smaller monthly pension. */
  conversionFactor: number;
}

export interface SimOutputs {
  /** Projected balance at retirement (₪, nominal). */
  finalBalance: number;
  /** Estimated monthly pension after conversion (₪, nominal). */
  monthlyPension: number;
  /** ₪ delta vs the baseline scenario. */
  balanceDelta: number;
  pensionDelta: number;
  /** % delta vs baseline. */
  balanceDeltaPct: number;
  pensionDeltaPct: number;
}

/** Future value of current balance + monthly contributions, net of fees. */
function projectBalance(
  startBalance: number,
  monthly: number,
  years: number,
  netAnnualPct: number,
): number {
  const r = netAnnualPct / 100;        // annual rate (decimal)
  const n = years;                     // years
  const fvLump = startBalance * Math.pow(1 + r, n);

  // FV of monthly annuity: convert annual rate to monthly compounding,
  // sum of (12 × n) payments at start of month.
  if (monthly <= 0 || n <= 0) return Math.round(fvLump);
  const rm = Math.pow(1 + r, 1 / 12) - 1;
  const months = n * 12;
  const fvMonthly = monthly * ((Math.pow(1 + rm, months) - 1) / rm) * (1 + rm);

  return Math.round(fvLump + fvMonthly);
}

/** Run the simulation. Returns nominal ₪ values + comparison to baseline. */
export function simulateFund(
  fund: PensionFund,
  overrides: SimInputs,
  baseline: SimInputs,
): SimOutputs {
  const sim = projectScenario(fund, overrides);
  const base = projectScenario(fund, baseline);

  const balanceDelta = sim.finalBalance - base.finalBalance;
  const pensionDelta = sim.monthlyPension - base.monthlyPension;
  const balanceDeltaPct = base.finalBalance > 0
    ? (balanceDelta / base.finalBalance) * 100
    : 0;
  const pensionDeltaPct = base.monthlyPension > 0
    ? (pensionDelta / base.monthlyPension) * 100
    : 0;

  return {
    finalBalance: sim.finalBalance,
    monthlyPension: sim.monthlyPension,
    balanceDelta,
    pensionDelta,
    balanceDeltaPct,
    pensionDeltaPct,
  };
}

function projectScenario(fund: PensionFund, p: SimInputs): { finalBalance: number; monthlyPension: number } {
  const netReturn = p.expectedReturnPct - p.mgmtFeeBalancePct;
  const finalBalance = projectBalance(
    fund.balance || 0,
    p.monthlyContrib,
    p.yearsToRetirement,
    netReturn,
  );
  // Conversion factor: balance ÷ factor = monthly pension.
  // 200 ≈ standard pension (DC), 175 ≈ ביטוח מנהלים, 180 ≈ גמל לקצבה.
  const monthlyPension = p.conversionFactor > 0
    ? Math.round(finalBalance / p.conversionFactor)
    : 0;
  return { finalBalance, monthlyPension };
}

/** Default conversion factor by fund type — sensible Israeli starting points. */
export function defaultFactorByType(type: PensionFund["type"]): number {
  switch (type) {
    case "bituach":    return 175; // ביטוח מנהלים
    case "pension":    return 200; // קרן פנסיה (DC, Israeli market average)
    case "gemel":      return 200; // קופת גמל לקצבה
    case "hishtalmut": return 200; // השתלמות נמשכת בד״כ הונית, factor פחות רלוונטי
    default:           return 200;
  }
}
