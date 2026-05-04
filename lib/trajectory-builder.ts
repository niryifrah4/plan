/**
 * ═══════════════════════════════════════════════════════════
 *  Trajectory Builder
 * ═══════════════════════════════════════════════════════════
 *
 * Extracted from dashboard `trajectory` useMemo so that /retirement can
 * re-build the trajectory interactively when sliders change (retirementAge,
 * monthlyInvestment, SWR, etc). Single source of truth for "what will the
 * wealth look like year by year".
 *
 * Keep dashboard using this — avoids drift between the two pages.
 */

import { futureValue } from "./financial-math";
import type { Assumptions } from "./assumptions";
import type { TrajectoryPoint } from "./fire-calculator";

export interface TrajectoryInput {
  assumptions: Assumptions;
  /** Liquid + investments balance today. */
  liquid: number;
  /** Pension balance today. */
  pension: number;
  /** Real estate total current value. */
  realestate: number;
  /**
   * Optional — subtract amortized liabilities from `total` each year.
   * Liabilities amortize to 0 over 20 years (5%/year straight-line simplification).
   * Dashboard uses this; /retirement doesn't (income-view cares about gross flow).
   */
  liabilitiesToday?: number;
}

/**
 * Extended trajectory point — base TrajectoryPoint plus fields the dashboard
 * needs (real-mode tax math, x-axis tick labels). Defined here so the dashboard
 * and retirement engine share one shape.
 */
export interface ExtendedTrajectoryPoint extends TrajectoryPoint {
  liquidStart: number;
  liquidContribCum: number;
  label: string;
}

/**
 * Build a year-by-year trajectory from currentAge → 100.
 *
 * Accumulation phase (age ≤ retirementAge):
 *   • liquid grows with monthly contribution (compounding salary growth)
 *   • pension grows (contribution already baked into monthlyInvestment stream — simplification)
 *   • realestate appreciates 3%/year
 *
 * Drawdown phase (age > retirementAge):
 *   • Blended retirement return applied to both pots
 *   • Annual withdrawal at SWR, split pro-rata between pension and liquid
 */
export function buildTrajectory(input: TrajectoryInput): ExtendedTrajectoryPoint[] {
  const a = input.assumptions;
  const startAge = a.currentAge;
  const startYear = 2026;
  const startMonth = 3;
  const salaryGrowth = a.salaryGrowthRate ?? 0.03;

  const yearsToRetirement = a.retirementAge - startAge;
  const penAtRetirement = futureValue(
    input.pension,
    0,
    a.expectedReturnPension - a.managementFeePension,
    Math.max(0, yearsToRetirement)
  );
  const growingMonthlyAtRet =
    a.monthlyInvestment * Math.pow(1 + salaryGrowth, Math.max(0, yearsToRetirement));
  const liqAtRetirement = futureValue(
    input.liquid,
    growingMonthlyAtRet,
    a.expectedReturnInvest - a.managementFeeInvest,
    Math.max(0, yearsToRetirement)
  );
  const retirementReturnRate =
    (a.expectedReturnPension -
      a.managementFeePension +
      a.expectedReturnInvest -
      a.managementFeeInvest) /
    2;
  const annualWithdrawal = (penAtRetirement + liqAtRetirement) * (a.safeWithdrawalRate ?? 0.04);

  let penPost = penAtRetirement;
  let liqPost = liqAtRetirement;
  let cumContrib = 0;

  const points: ExtendedTrajectoryPoint[] = [];
  for (let age = startAge; age <= 100; age++) {
    const yearsIn = age - startAge;
    const yr = startYear + yearsIn;
    const reVal = input.realestate * Math.pow(1.03, yearsIn);

    let penVal: number, liqVal: number;
    if (age <= a.retirementAge) {
      const growingMonthly = a.monthlyInvestment * Math.pow(1 + salaryGrowth, yearsIn);
      penVal = futureValue(
        input.pension,
        0,
        a.expectedReturnPension - a.managementFeePension,
        yearsIn
      );
      liqVal = futureValue(
        input.liquid,
        growingMonthly,
        a.expectedReturnInvest - a.managementFeeInvest,
        yearsIn
      );
      cumContrib = growingMonthly * 12 * yearsIn;
    } else {
      const totalAtRet = penAtRetirement + liqAtRetirement || 1;
      penPost = Math.max(
        0,
        penPost * (1 + retirementReturnRate) - annualWithdrawal * (penAtRetirement / totalAtRet)
      );
      liqPost = Math.max(
        0,
        liqPost * (1 + retirementReturnRate) - annualWithdrawal * (liqAtRetirement / totalAtRet)
      );
      penVal = penPost;
      liqVal = liqPost;
    }

    const liabRemaining = (input.liabilitiesToday ?? 0) * Math.max(0, 1 - yearsIn * 0.05);
    points.push({
      age,
      year: yr,
      month: startMonth,
      label: age % 5 === 0 || age === startAge || age === a.retirementAge ? `${yr}` : "",
      liquid: liqVal,
      pension: penVal,
      realestate: reVal,
      total: liqVal + penVal + reVal - liabRemaining,
      liquidStart: input.liquid,
      liquidContribCum: cumContrib,
    });
  }
  return points;
}
