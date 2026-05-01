/**
 * ═══════════════════════════════════════════════════════════
 *  Buckets Rebalancing Engine — the "brain" of the new Plan
 * ═══════════════════════════════════════════════════════════
 *
 * Given a Bucket (current amount, target, monthly contribution,
 * expected return, actual return), calculates:
 *
 *   1. Where the bucket is heading (projected final value)
 *   2. When it will actually hit its target (projected completion date)
 *   3. What monthly contribution is REQUIRED to hit target on time
 *   4. Whether the client is ahead, on track, behind, or at risk
 *   5. A concrete recommendation: free-up cash / increase contribution / extend date
 *
 * CRITICAL: This engine produces CASHFLOW recommendations, NOT
 * pension product advice. We recommend redirecting free monthly
 * cash — we never recommend which fund/product to use.
 */

import type { Bucket, BucketStatus } from "./buckets-core";

/* ═══════════════════════════════════════════════════════════ */
/* Types                                                         */
/* ═══════════════════════════════════════════════════════════ */

export type RecommendationType =
  | "free_up"       // Goal is ahead — client can reduce monthly contribution
  | "increase"      // Goal is behind — client needs to add more
  | "extend_date"   // Goal is unreachable without extending timeline
  | "on_track"      // No action needed
  | "reach_now";    // Already reached — can stop contributing

export interface BucketRecommendation {
  type: RecommendationType;
  /** ILS amount relevant to the recommendation (free-up amount, required increase, etc.) */
  amount?: number;
  /** Suggested new target date (only for "extend_date" type) */
  suggestedDate?: string;
  /** Hebrew message suitable for showing the client */
  message: string;
  /** Short title/label for badges */
  title: string;
  /** How confident we are (more history = higher confidence) */
  confidence: "high" | "medium" | "low";
}

export interface BucketProjection {
  bucketId: string;
  /** Months until the target date (0 if in the past) */
  monthsRemaining: number;
  /** Years until the target date (for display) */
  yearsRemaining: number;
  /** Progress percentage toward target (0-100) */
  progressPct: number;
  /** Projected final value at the target date, assuming plan continues as-is */
  projectedFinalValue: number;
  /** Gap between target and projected final value (positive = shortfall) */
  gap: number;
  /** What monthly contribution would be needed to hit target exactly on time */
  requiredMonthly: number;
  /** Current monthly contribution (copied from bucket for convenience) */
  currentMonthly: number;
  /** Status bucket — drives UI color */
  status: BucketStatus;
  /** Projected completion date IF client continues current plan AND returns stay as-is */
  projectedCompletionDate: string;
  /** Months saved/lost vs target (negative = late, positive = early) */
  monthsVsTarget: number;
  /** The recommendation for this bucket */
  recommendation: BucketRecommendation;
  /** The effective return rate used for this projection */
  effectiveAnnualReturn: number;
}

/* ═══════════════════════════════════════════════════════════ */
/* Pure math helpers                                             */
/* ═══════════════════════════════════════════════════════════ */

/** Number of full months between today and an ISO date (YYYY-MM-DD) */
export function monthsUntil(isoDate: string): number {
  const target = new Date(isoDate);
  const now = new Date();
  const years = target.getFullYear() - now.getFullYear();
  const months = target.getMonth() - now.getMonth();
  const days = target.getDate() - now.getDate();
  // Bug fix 2026-04-27: both ternary arms were 0, so target=apr-30 with
  // today=apr-26 returned 0 months remaining and flagged the bucket
  // "at risk". Subtract a month when the day-of-month hasn't reached
  // the target day yet.
  return Math.max(0, years * 12 + months + (days < 0 ? -1 : 0));
}

/**
 * Future value of an annuity + lump sum.
 * FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r
 */
export function fv(pv: number, pmt: number, annualRate: number, months: number): number {
  if (months <= 0) return pv;
  const r = annualRate / 12;
  if (r === 0) return pv + pmt * months;
  const growth = Math.pow(1 + r, months);
  return pv * growth + pmt * ((growth - 1) / r);
}

/**
 * Required monthly payment (PMT) to reach a target FV given PV, rate, and months.
 * Solves: target = PV*(1+r)^n + PMT*((1+r)^n - 1)/r for PMT
 */
export function requiredPmt(
  currentAmount: number,
  targetAmount: number,
  annualRate: number,
  months: number
): number {
  if (months <= 0) return Math.max(0, targetAmount - currentAmount);
  const r = annualRate / 12;
  if (r === 0) return Math.max(0, (targetAmount - currentAmount) / months);
  const growth = Math.pow(1 + r, months);
  const lumpFv = currentAmount * growth;
  const remaining = targetAmount - lumpFv;
  if (remaining <= 0) return 0;
  return remaining / ((growth - 1) / r);
}

/**
 * How many months until the FV reaches a given target, assuming constant PMT and rate.
 * Uses binary search for robustness.
 */
export function monthsToReach(
  currentAmount: number,
  pmt: number,
  annualRate: number,
  target: number
): number {
  if (currentAmount >= target) return 0;
  if (pmt <= 0 && currentAmount < target && annualRate <= 0) return Infinity;

  // Binary search up to 1200 months (100 years)
  let lo = 0;
  let hi = 1200;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fv(currentAmount, pmt, annualRate, mid) >= target) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/* ═══════════════════════════════════════════════════════════ */
/* Status & recommendation logic                                 */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Determine a bucket's status based on projected vs target.
 * - ahead: will reach the target with > ~5% safety margin
 * - on_track: roughly at target (+/- 5%)
 * - behind: projected short by 5-25%
 * - at_risk: projected short by > 25%, or will miss target date by > 6 months
 */
function calculateStatus(
  projectedFinal: number,
  target: number,
  monthsVsTarget: number
): BucketStatus {
  if (target <= 0) return "on_track";
  const ratio = projectedFinal / target;

  // Hitting early by 3+ months with enough in the pot = ahead
  if (ratio >= 1.05 && monthsVsTarget >= 3) return "ahead";
  if (ratio >= 0.95 && monthsVsTarget >= -1) return "on_track";
  if (ratio >= 0.75) return "behind";
  return "at_risk";
}

/**
 * Build a concrete recommendation for the client.
 *
 * The core logic:
 *  - If projected > target by a meaningful margin → offer to free up monthly cash
 *  - If projected < target → suggest an increase in contribution OR date extension
 *  - If already reached → celebrate, stop contributing
 *  - Otherwise → on track, no action
 */
function buildRecommendation(
  bucket: Bucket,
  months: number,
  projectedFinal: number,
  requiredMonthly: number,
  status: BucketStatus,
  hasActualReturn: boolean
): BucketRecommendation {
  const currentMonthly = bucket.monthlyContribution;
  const target = bucket.targetAmount;

  // Confidence based on whether we have measured actual return
  const confidence: "high" | "medium" | "low" = hasActualReturn ? "high" : "medium";

  // Already hit the target — stop contributing
  if (bucket.currentAmount >= target) {
    return {
      type: "reach_now",
      amount: currentMonthly,
      title: "🎉 הגעת ליעד",
      message: `הקופה "${bucket.name}" הגיעה ליעד ${target.toLocaleString("he-IL")}₪. ` +
               `אפשר לעצור את ההפקדה החודשית של ${currentMonthly.toLocaleString("he-IL")}₪ ולכוון אותה למטרה אחרת.`,
      confidence,
    };
  }

  // Can we reduce? Calculate how much we could free up and still hit target on time
  if (status === "ahead") {
    const excess = Math.max(0, currentMonthly - requiredMonthly);
    // Round down to 50-shekel increment for human-friendly numbers
    const roundedExcess = Math.floor(excess / 50) * 50;

    if (roundedExcess >= 50) {
      const newMonthly = currentMonthly - roundedExcess;
      return {
        type: "free_up",
        amount: roundedExcess,
        title: "✨ שחרור תזרים",
        message: `הקופה "${bucket.name}" מקדימה את התכנית. ` +
                 `אפשר להוריד את ההפקדה החודשית מ-${currentMonthly.toLocaleString("he-IL")}₪ ל-${newMonthly.toLocaleString("he-IL")}₪ ` +
                 `ועדיין להגיע ליעד בזמן. זה משחרר ${roundedExcess.toLocaleString("he-IL")}₪ בחודש לתזרים הפנוי שלך.`,
        confidence,
      };
    }
  }

  // Need to increase? Calculate by how much
  if (status === "behind" || status === "at_risk") {
    const shortfall = Math.max(0, requiredMonthly - currentMonthly);
    const roundedShortfall = Math.ceil(shortfall / 50) * 50;

    // If the required increase is reasonable (< 3x current), suggest increase
    if (currentMonthly > 0 && roundedShortfall < currentMonthly * 3) {
      const newMonthly = currentMonthly + roundedShortfall;
      return {
        type: "increase",
        amount: roundedShortfall,
        title: "⚠️ חסר בתקציב",
        message: `הקופה "${bucket.name}" בפיגור. ` +
                 `כדי להגיע ליעד בזמן צריך להעלות את ההפקדה החודשית מ-${currentMonthly.toLocaleString("he-IL")}₪ ל-${newMonthly.toLocaleString("he-IL")}₪ ` +
                 `(תוספת של ${roundedShortfall.toLocaleString("he-IL")}₪ לחודש).`,
        confidence,
      };
    }

    // Otherwise — suggest extending the target date
    const currentRate = bucket.expectedAnnualReturn;
    const monthsNeeded = monthsToReach(bucket.currentAmount, currentMonthly, currentRate, target);
    if (monthsNeeded > 0 && monthsNeeded < 600) {
      const newTargetDate = new Date();
      newTargetDate.setMonth(newTargetDate.getMonth() + monthsNeeded);
      const delta = monthsNeeded - months;
      return {
        type: "extend_date",
        suggestedDate: newTargetDate.toISOString().split("T")[0],
        title: "📅 דחיית יעד",
        message: `בקצב הנוכחי הקופה "${bucket.name}" לא תגיע ליעד בזמן. ` +
                 `בהפקדה של ${currentMonthly.toLocaleString("he-IL")}₪ לחודש, המטרה תושג בעוד ${monthsNeeded} חודשים ` +
                 `(דחייה של ${delta} חודשים). אפשר להוסיף לתזרים או לדחות את היעד.`,
        confidence,
      };
    }

    // Last resort — target is effectively unreachable
    return {
      type: "increase",
      amount: roundedShortfall,
      title: "⚠️ יעד בסיכון",
      message: `הקופה "${bucket.name}" בסיכון גבוה. צריך להגדיל את ההפקדה ב-${roundedShortfall.toLocaleString("he-IL")}₪ לחודש ` +
               `או לבחון מחדש את היעד יחד עם המתכנן הפיננסי שלך.`,
      confidence: "low",
    };
  }

  // on_track — no action needed
  return {
    type: "on_track",
    title: "בדרך הנכונה",
    message: `הקופה "${bucket.name}" בקצב טוב להגיע ליעד ${target.toLocaleString("he-IL")}₪ בזמן. המשך כך.`,
    confidence,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Main projection function — the public API                    */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Project a single bucket's trajectory and produce a recommendation.
 * This is the function that powers every goal card, notification, and
 * rebalancing suggestion in the app.
 */
export function projectBucket(bucket: Bucket): BucketProjection {
  const months = monthsUntil(bucket.targetDate);
  const years = months / 12;

  // Use actual return if we have it (from מסלקה snapshots), otherwise expected
  const hasActualReturn = typeof bucket.actualAnnualReturn === "number";
  const effectiveRate = hasActualReturn
    ? (bucket.actualAnnualReturn as number)
    : bucket.expectedAnnualReturn;

  // Projected final value with current plan
  const projectedFinal = fv(
    bucket.currentAmount,
    bucket.monthlyContribution,
    effectiveRate,
    months
  );

  // What monthly payment would be needed to hit target exactly
  const reqMonthly = requiredPmt(
    bucket.currentAmount,
    bucket.targetAmount,
    effectiveRate,
    months
  );

  // When will the plan ACTUALLY reach target (with current PMT + rate)?
  const monthsToTarget = monthsToReach(
    bucket.currentAmount,
    bucket.monthlyContribution,
    effectiveRate,
    bucket.targetAmount
  );

  const projectedDate = new Date();
  if (monthsToTarget !== Infinity) {
    projectedDate.setMonth(projectedDate.getMonth() + monthsToTarget);
  }
  const projectedCompletionDate = projectedDate.toISOString().split("T")[0];

  // Early/late by how many months
  const monthsVsTarget = months - monthsToTarget;

  // Progress percentage
  const progressPct = bucket.targetAmount > 0
    ? Math.min(100, Math.round((bucket.currentAmount / bucket.targetAmount) * 100))
    : 0;

  // Gap (positive = shortfall)
  const gap = bucket.targetAmount - projectedFinal;

  // Status
  const status = calculateStatus(projectedFinal, bucket.targetAmount, monthsVsTarget);

  // Recommendation
  const recommendation = buildRecommendation(
    bucket,
    months,
    projectedFinal,
    reqMonthly,
    status,
    hasActualReturn
  );

  return {
    bucketId: bucket.id,
    monthsRemaining: months,
    yearsRemaining: years,
    progressPct,
    projectedFinalValue: projectedFinal,
    gap,
    requiredMonthly: reqMonthly,
    currentMonthly: bucket.monthlyContribution,
    status,
    projectedCompletionDate,
    monthsVsTarget,
    recommendation,
    effectiveAnnualReturn: effectiveRate,
  };
}

/** Project all buckets in a list */
export function projectAll(buckets: Bucket[]): BucketProjection[] {
  return buckets.map(projectBucket);
}

/**
 * Aggregate: total free-up potential across all buckets.
 * This is what we show on the dashboard: "You have ₪X free cashflow to redirect."
 */
export function totalFreeUpPotential(buckets: Bucket[]): number {
  return projectAll(buckets)
    .filter(p => p.recommendation.type === "free_up" && p.recommendation.amount)
    .reduce((sum, p) => sum + (p.recommendation.amount || 0), 0);
}

/**
 * Aggregate: total additional contribution needed across all buckets in deficit.
 */
export function totalDeficitContribution(buckets: Bucket[]): number {
  return projectAll(buckets)
    .filter(p => p.recommendation.type === "increase" && p.recommendation.amount)
    .reduce((sum, p) => sum + (p.recommendation.amount || 0), 0);
}

/**
 * Derive actualAnnualReturn from a bucket's balanceSnapshots.
 * Needs at least 2 snapshots across > 30 days to return a meaningful value.
 * Uses simple CAGR between first and latest snapshot, adjusted for contributions.
 */
export function deriveActualReturn(bucket: Bucket): number | null {
  const snaps = bucket.balanceSnapshots;
  if (!snaps || snaps.length < 2) return null;

  const sorted = [...snaps].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const daysBetween =
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);
  if (daysBetween < 30) return null;

  // Total contributions between first and last snapshot
  const contribs = bucket.contributionHistory
    .filter(c => {
      const d = new Date(c.confirmedAt).getTime();
      return d >= new Date(first.date).getTime() && d <= new Date(last.date).getTime();
    })
    .reduce((sum, c) => sum + c.actual, 0);

  // Approximate growth: (final - initial - contribs) / initial, annualized
  const growth = last.balance - first.balance - contribs;
  if (first.balance <= 0) return null;
  const simpleReturn = growth / first.balance;
  const yearsElapsed = daysBetween / 365.25;
  if (yearsElapsed <= 0) return null;

  // Annualize (use ^(1/years) for proper CAGR)
  const annualized = Math.pow(1 + simpleReturn, 1 / yearsElapsed) - 1;

  // Sanity bounds: -50% to +50% annually
  if (annualized < -0.5 || annualized > 0.5) return null;
  return annualized;
}
