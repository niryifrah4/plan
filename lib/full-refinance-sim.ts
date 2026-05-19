/**
 * Full mortgage refinance simulator — works across ALL tracks of a single
 * mortgage at once. Built 2026-05-18 per Nir.
 *
 * The per-track RefinanceSimulator answers "should I refi this track?".
 * This one answers "should I open a fresh mortgage for the entire balance,
 * with a different track mix?".
 *
 * Output: status-quo cost + 3 alternative mix scenarios (conservative /
 * balanced / aggressive), each with new monthly, total cost, early-fee
 * impact, and net saving vs status quo.
 *
 * Pure function — no React, no storage.
 */

import { pmt } from "./_shared/financial-math";
import {
  calcEarlyRepaymentFee,
  inferRepaymentFeeIndexation,
} from "./_shared/financial-math";
import { effectiveTrackRate } from "./debt-store";
import type { MortgageData, MortgageTrack } from "./debt-store";

export type MixScenarioKey = "conservative" | "balanced" | "aggressive";

export interface MixAllocation {
  /** Fraction of total balance (0-1). Sums to 1.0 across the 3 components. */
  fixedUnlinked: number; // קל"צ
  fixedLinked: number; // ק"צ
  prime: number; // פריים
}

const SCENARIOS: Record<MixScenarioKey, { label: string; alloc: MixAllocation; description: string }> = {
  conservative: {
    label: "שמרני",
    alloc: { fixedUnlinked: 0.4, fixedLinked: 0.3, prime: 0.3 },
    description: "60% ריבית קבועה — מגן מפני עליית ריבית, אבל חוסך פחות עכשיו.",
  },
  balanced: {
    label: "מאוזן",
    alloc: { fixedUnlinked: 0.3, fixedLinked: 0.3, prime: 0.4 },
    description: "תמהיל קלאסי. איזון בין יציבות לחיסכון.",
  },
  aggressive: {
    label: "אגרסיבי",
    alloc: { fixedUnlinked: 0.2, fixedLinked: 0.2, prime: 0.6 },
    description: "60% פריים — חיסכון מקסימלי כעת, חשיפה לעליית ריבית.",
  },
};

export interface FullRefiInputs {
  /** The mortgage to refinance (all its tracks). */
  mortgage: MortgageData;
  /** Bank-of-Israel "ריבית ממוצעת". Fraction. */
  marketRate: number;
  /** Current Prime rate. Fraction. */
  primeRate: number;
  /** New term in months. Default 240 (20 years). */
  newTermMonths?: number;
  /** Additional one-time prep cash injected into the new mortgage (לקיחה
   *  נמוכה יותר ע"י תוספת הון עצמי). */
  additionalEquity?: number;
}

export interface TrackCost {
  trackId: string;
  trackName: string;
  remainingBalance: number;
  monthlyPayment: number;
  monthsRemaining: number;
  totalCost: number;
  earlyFee: number;
}

export interface StatusQuo {
  totalBalance: number;
  totalMonthly: number;
  weightedRate: number; // fraction
  weightedMonthsRemaining: number;
  totalRemainingCost: number;
  perTrack: TrackCost[];
  totalEarlyFee: number; // if you refi everything today
}

export interface MixScenarioResult {
  key: MixScenarioKey;
  label: string;
  description: string;
  alloc: MixAllocation;
  // Rates assumed for each component in this scenario:
  ratesUsed: { fixedUnlinked: number; fixedLinked: number; prime: number };
  newMonthly: number;
  newTotalCost: number; // sum of monthly × months
  monthlySaving: number; // current - new
  lifetimeSaving: number; // currentTotalRemaining - (newTotal + earlyFee)
  breakEvenMonths: number | null;
}

export interface FullRefiResult {
  statusQuo: StatusQuo;
  newTermMonths: number;
  scenarios: MixScenarioResult[];
  /** Recommendation key — chosen by lifetime saving and monthly cushion. */
  recommendation: MixScenarioKey;
}

function solveRemainingMonths(balance: number, monthly: number, annualRate: number): number {
  if (balance <= 0 || monthly <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(balance / monthly);
  const ratio = (balance * r) / monthly;
  if (ratio >= 1) return 600;
  if (ratio <= 0) return 0;
  return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
}

/**
 * Representative rate per component under current market conditions.
 * Used to project the NEW monthly payments. These are "typical bank offer"
 * assumptions — actual quotes from banks may differ.
 */
function ratesForScenario(marketRate: number, primeRate: number) {
  return {
    // קל"צ — slight premium over BoI avg (most fixed-rate quotes)
    fixedUnlinked: marketRate + 0.003,
    // ק"צ — typically ~40bps below קל"צ (so ~70bps below market rate). Lower
    // than קל"צ because borrower bears the inflation risk, not the bank.
    // 2026-05-18 calibration per finance-agent — was 80bps below market,
    // which exaggerated ק"צ's attractiveness and pushed users toward the
    // aggressive scenario unfairly.
    fixedLinked: Math.max(0.02, marketRate - 0.004),
    // פריים — direct
    prime: primeRate,
  };
}

export function simulateFullRefinance(i: FullRefiInputs): FullRefiResult {
  const newTermMonths = i.newTermMonths ?? 240;
  const tracks = i.mortgage.tracks || [];

  // ── Status quo ──────────────────────────────────────────────────
  const perTrack: TrackCost[] = [];
  let totalBalance = 0;
  let totalMonthly = 0;
  let weightedRateSum = 0;
  let totalRemainingCost = 0;
  let totalEarlyFee = 0;
  let totalMonthsWeighted = 0;

  for (const t of tracks) {
    if (!t.remainingBalance || !t.monthlyPayment) continue;
    // Prime tracks store interestRate=0 and use margin instead. Using
    // interestRate alone would give rate=0 → wildly inflated "savings" in the
    // refi simulator. effectiveTrackRate resolves prime+margin correctly.
    const rate = effectiveTrackRate(t, i.primeRate);
    const monthsRemaining = solveRemainingMonths(t.remainingBalance, t.monthlyPayment, rate);
    const totalCost = t.monthlyPayment * monthsRemaining;
    const fee = calcEarlyRepaymentFee({
      remainingBalance: t.remainingBalance,
      monthlyPayment: t.monthlyPayment,
      trackRate: rate,
      marketRate: i.marketRate,
      indexation: inferRepaymentFeeIndexation(t.indexation, t.name),
      gaveNotice: true,
    });
    perTrack.push({
      trackId: t.id,
      trackName: t.name || "מסלול",
      remainingBalance: t.remainingBalance,
      monthlyPayment: t.monthlyPayment,
      monthsRemaining,
      totalCost: Math.round(totalCost),
      earlyFee: fee.total,
    });
    totalBalance += t.remainingBalance;
    totalMonthly += t.monthlyPayment;
    weightedRateSum += rate * t.remainingBalance;
    totalRemainingCost += totalCost;
    totalEarlyFee += fee.total;
    totalMonthsWeighted += monthsRemaining * t.remainingBalance;
  }

  const weightedRate = totalBalance > 0 ? weightedRateSum / totalBalance : 0;
  const weightedMonthsRemaining =
    totalBalance > 0 ? Math.round(totalMonthsWeighted / totalBalance) : 0;

  const statusQuo: StatusQuo = {
    totalBalance,
    totalMonthly,
    weightedRate,
    weightedMonthsRemaining,
    totalRemainingCost: Math.round(totalRemainingCost),
    perTrack,
    totalEarlyFee,
  };

  // New balance after optional equity injection
  const newPrincipal = Math.max(0, totalBalance - (i.additionalEquity || 0));

  // ── Scenario calculations ───────────────────────────────────────
  const rates = ratesForScenario(i.marketRate, i.primeRate);

  const scenarios: MixScenarioResult[] = (
    Object.keys(SCENARIOS) as MixScenarioKey[]
  ).map((key) => {
    const def = SCENARIOS[key];
    const alloc = def.alloc;
    const mFixedU =
      alloc.fixedUnlinked > 0 ? pmt(newPrincipal * alloc.fixedUnlinked, rates.fixedUnlinked, newTermMonths) : 0;
    const mFixedL =
      alloc.fixedLinked > 0 ? pmt(newPrincipal * alloc.fixedLinked, rates.fixedLinked, newTermMonths) : 0;
    const mPrime =
      alloc.prime > 0 ? pmt(newPrincipal * alloc.prime, rates.prime, newTermMonths) : 0;
    const newMonthly = mFixedU + mFixedL + mPrime;
    const newTotalCost = Math.round(newMonthly * newTermMonths);
    const monthlySaving = totalMonthly - newMonthly;
    // Lifetime: today, you also pay the early fee + equity injection up front.
    const upfront = totalEarlyFee + (i.additionalEquity || 0);
    const lifetimeSaving = Math.round(totalRemainingCost - newTotalCost - upfront);
    const breakEvenMonths =
      monthlySaving > 0 ? Math.ceil(upfront / monthlySaving) : null;

    return {
      key,
      label: def.label,
      description: def.description,
      alloc,
      ratesUsed: rates,
      newMonthly: Math.round(newMonthly),
      newTotalCost,
      monthlySaving: Math.round(monthlySaving),
      lifetimeSaving,
      breakEvenMonths,
    };
  });

  // Recommendation: max lifetime saving when monthly is also positive.
  // If no scenario saves monthly, pick the one with smallest monthly increase
  // (helps users who refi for term-restructuring even at a cost).
  const positiveCushion = scenarios.filter((s) => s.monthlySaving >= 0);
  const candidates = positiveCushion.length > 0 ? positiveCushion : scenarios;
  candidates.sort((a, b) => b.lifetimeSaving - a.lifetimeSaving);
  const recommendation = candidates[0].key;

  return {
    statusQuo,
    newTermMonths,
    scenarios,
    recommendation,
  };
}

export { SCENARIOS as MIX_SCENARIOS };
