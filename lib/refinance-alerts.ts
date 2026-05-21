/**
 * Refinance Alerts — proactive "next-best-time-to-refinance" signals.
 *
 * Built 2026-05-18 per Nir: most Israeli families miss their refinance
 * windows because no one tells them when to act. We surface 3 kinds of
 * signal per mortgage track:
 *
 *   1. variable-period tracks ("ריבית משתנה כל X שנים") have NO penalty
 *      at the change date — natural refi point. Warn 3 months before.
 *   2. Prime tracks float — flag when current Prime is meaningfully
 *      below the track's effective rate (e.g. user locked in a margin
 *      that's no longer competitive).
 *   3. Fixed (קל"צ / ק"צ) tracks — flag when market rate dropped enough
 *      that the early-repayment fee pays back within ~18 months.
 *
 * Pure function — depends on debt-store + assumptions + realestate-store
 * only. No React. Caller renders the resulting Alert[] however they like.
 */

import type { DebtData, MortgageData, MortgageTrack } from "./debt-store";
import { effectiveTrackRate } from "./debt-store";
import type { Property } from "./realestate-store";
import {
  calcEarlyRepaymentFee,
  inferRepaymentFeeIndexation,
} from "./_shared/financial-math";

export type RefiAlertKind =
  | "variable-period-window" // change date approaching, no fee
  | "prime-spread-tight" // BoI dropped, track's effective rate is now high vs Prime
  | "market-gap-payback" // market rate below track rate; payback < 18 mo
  | "high-rate-investor"; // generic — track rate is just plain high

export type RefiAlertSeverity = "info" | "opportunity" | "warning";

export interface RefiAlert {
  id: string;
  kind: RefiAlertKind;
  severity: RefiAlertSeverity;
  /** Foreign keys */
  mortgageId: string;
  trackId: string;
  propertyId?: string;
  /** Display fields */
  title: string;
  detail: string;
  /** Estimated saving (₪) or other quantifiable impact. Optional. */
  impactILS?: number;
  /** When to act — ISO date "YYYY-MM" or human-readable. */
  whenLabel?: string;
  /** Sort key — smaller = act sooner (in months from today, negative = overdue). */
  monthsUntilAction: number;
  /** Optional context — property name for inline display. */
  propertyName?: string;
  bankName?: string;
  trackName?: string;
}

interface AlertOptions {
  /** BoI's published "ריבית ממוצעת חזויה". Fraction (0.05 = 5%). */
  marketRate: number;
  /** Current Prime rate. Fraction (0.06 = 6%). */
  primeRate: number;
  /** Threshold (months) — variable-period alerts fire within this window. */
  variableWindowMonths?: number; // default 4
  /** Threshold — fixed-rate market gap alerts require ≥ this in bps. */
  fixedRateGapBps?: number; // default 50 (0.5%)
  /** Threshold — payback period required for "worth it" alerts. */
  paybackMonthsMax?: number; // default 18
}

/** Months between two YYYY-MM dates. Positive = future. */
function monthsBetween(now: Date, ymTarget: string): number {
  if (!ymTarget) return Infinity;
  const [y, m] = ymTarget.split("-").map(Number);
  if (!y || !m) return Infinity;
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
}

/**
 * Generate refinance alerts for a debt store. Properties argument is
 * optional — used purely for display (showing the property name on the
 * alert). Without it, alerts still fire but show only bank + track name.
 */
export function generateRefinanceAlerts(
  debt: DebtData,
  properties: Property[],
  opts: AlertOptions
): RefiAlert[] {
  const alerts: RefiAlert[] = [];
  const now = new Date();
  const variableWindowMonths = opts.variableWindowMonths ?? 4;
  const fixedRateGapBps = opts.fixedRateGapBps ?? 50;
  const paybackMonthsMax = opts.paybackMonthsMax ?? 18;
  const propsById = new Map(properties.map((p) => [p.id, p]));

  for (const mortgage of debt.mortgages) {
    const property = mortgage.propertyId ? propsById.get(mortgage.propertyId) : undefined;
    const propertyName = property?.name;

    for (const track of mortgage.tracks) {
      if (!track.remainingBalance || !track.monthlyPayment) continue;
      const indexation = inferRepaymentFeeIndexation(track.indexation, track.name);
      // Rates are DECIMAL across the debt module (2026-05-19 standard).
      // effectiveTrackRate returns decimal; track.interestRate is decimal.
      const effRate = effectiveTrackRate(track, opts.primeRate);
      const trackRate = track.interestRate || effRate || 0;

      const baseCtx = {
        mortgageId: mortgage.id,
        trackId: track.id,
        propertyId: mortgage.propertyId,
        propertyName,
        bankName: mortgage.bank,
        trackName: track.name,
      };

      // ── 1. Variable-period tracks — change date window ────────────
      if (indexation === "variable-period" && track.endDate) {
        // The user usually stores end-of-track date; for "every-5-years" tracks
        // the change date is sooner. Without explicit change-date tracking,
        // we treat track.endDate as the next decision point (conservative).
        const monthsToChange = monthsBetween(now, track.endDate);
        if (monthsToChange >= 0 && monthsToChange <= variableWindowMonths) {
          alerts.push({
            ...baseCtx,
            id: `var-window-${track.id}`,
            kind: "variable-period-window",
            severity: monthsToChange <= 1 ? "warning" : "opportunity",
            title:
              monthsToChange <= 1
                ? "נקודת מיחזור עכשיו — ללא עמלת היוון"
                : `נקודת מיחזור בעוד ${monthsToChange} חודשים`,
            detail: `מסלול "${track.name}" מגיע לנקודת שינוי ב-${track.endDate}. ניתן למחזר אז בלי עמלת היוון. שווה להתחיל לבדוק הצעות מהבנקים עכשיו.`,
            whenLabel: track.endDate,
            monthsUntilAction: monthsToChange,
          });
        }
      }

      // ── 2. Prime track with stale margin ──────────────────────────
      if (indexation === "prime") {
        // If the track was opened when Prime was higher, the margin set then
        // might be uncompetitive now. We compare to a "fair" Prime margin of
        // ≤ 0.5% above current Prime — anything beyond 1.0% is flaggable.
        const primeNow = opts.primeRate; // fraction
        const margin = trackRate - primeNow;
        if (margin > 0.01) {
          // > 1.0% above Prime
          const potentialSaving = Math.round(track.remainingBalance * (margin - 0.005));
          alerts.push({
            ...baseCtx,
            id: `prime-spread-${track.id}`,
            kind: "prime-spread-tight",
            severity: "opportunity",
            title: "מרווח גבוה מהפריים",
            detail: `מסלול "${track.name}" בריבית ${(trackRate * 100).toFixed(2)}% — מרווח של ${(margin * 100).toFixed(2)}% מעל הפריים הנוכחי (${(primeNow * 100).toFixed(2)}%). מיחזור יכול להוריד את המרווח. אין עמלת היוון על פריים.`,
            impactILS: Math.max(0, potentialSaving),
            whenLabel: "עכשיו",
            monthsUntilAction: 0,
          });
        }
      }

      // ── 3. Fixed tracks — market gap meaningful + fee pays back ───
      if (indexation === "fixed-unlinked" || indexation === "fixed-linked") {
        const gapBps = (trackRate - opts.marketRate) * 10000; // basis points
        if (gapBps >= fixedRateGapBps) {
          // Quote the early-repayment fee, then ask: at what new monthly do we
          // pay it back within paybackMonthsMax months?
          const fee = calcEarlyRepaymentFee({
            remainingBalance: track.remainingBalance,
            monthlyPayment: track.monthlyPayment,
            trackRate,
            marketRate: opts.marketRate,
            indexation,
            gaveNotice: true,
          });
          // Approximate monthly savings at the market rate.
          // Using PMT: new monthly ≈ balance × (market_r) / (1 - (1+market_r)^-N)
          const r = opts.marketRate / 12;
          const N = fee.monthsRemaining || 1;
          const newMonthly = r === 0 ? track.remainingBalance / N : (track.remainingBalance * r) / (1 - Math.pow(1 + r, -N));
          const monthlyDelta = Math.max(0, track.monthlyPayment - newMonthly);
          const paybackMonths = monthlyDelta > 0 ? Math.ceil(fee.total / monthlyDelta) : Infinity;

          if (paybackMonths <= paybackMonthsMax) {
            const lifetimeSaving = Math.round(monthlyDelta * N - fee.total);
            alerts.push({
              ...baseCtx,
              id: `market-gap-${track.id}`,
              kind: "market-gap-payback",
              severity: paybackMonths <= 6 ? "warning" : "opportunity",
              title: `מיחזור משתלם — החזר עמלה ב-${paybackMonths} חודשים`,
              detail: `הריבית בשוק (${(opts.marketRate * 100).toFixed(2)}%) נמוכה משלך (${(trackRate * 100).toFixed(2)}%) ב-${(gapBps / 100).toFixed(2)}%. עמלת היוון משוערת: ${Math.round(fee.total).toLocaleString()} ש"ח, מתכסה ב-${paybackMonths} חודשים. חיסכון לאורך כל המסלול: ~${lifetimeSaving.toLocaleString()} ש"ח.`,
              impactILS: lifetimeSaving,
              whenLabel: "עכשיו",
              monthsUntilAction: 0,
            });
          }
        }
      }

      // ── 4. Generic "just too high" — track > 7% with no other signal ──
      if (
        trackRate > 0.07 &&
        !alerts.some((a) => a.trackId === track.id) // don't duplicate if another alert fired
      ) {
        alerts.push({
          ...baseCtx,
          id: `high-rate-${track.id}`,
          kind: "high-rate-investor",
          severity: "info",
          title: `ריבית גבוהה — ${(trackRate * 100).toFixed(2)}%`,
          detail: `מסלול "${track.name}" בריבית ${(trackRate * 100).toFixed(2)}% — שווה לבדוק מיחזור גם מול הריבית הממוצעת בשוק (${(opts.marketRate * 100).toFixed(2)}%).`,
          whenLabel: "עכשיו",
          monthsUntilAction: 0,
        });
      }
    }
  }

  // Sort by urgency
  return alerts.sort((a, b) => a.monthsUntilAction - b.monthsUntilAction);
}
