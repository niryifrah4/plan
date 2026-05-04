/**
 * Verdant Ledger · Miluim (IDF Reserve Duty) tax-benefit simulator
 *
 * 2024 "חרבות ברזל" benefits (generalised — advisor should verify with
 * official פקודת מס הכנסה and ordinance 190 updates for each case):
 *
 *  1. מענק חד-פעמי: shekel amount per reserve day, tax-exempt.
 *  2. זיכוי מס: additional tax credit points — each point ≈ 2,976 ₪/year (2024).
 *  3. הנחה בארנונה/ביטוח לאומי/קרנות השתלמות הטבות — out-of-scope summary.
 *
 * This module returns an estimate + a list of entitlement bullets to show
 * to the household. NOT legal advice.
 */

export interface MiluimInputs {
  /** Total reserve days served in the tax year. */
  reserveDays: number;
  /** Consecutive days in a single stretch (for extended-service bonuses). */
  longestStretchDays: number;
  /** Monthly gross salary (before tax) — drives marginal-rate estimate. */
  monthlyGross: number;
  /** Is the reservist self-employed? (affects social-sec rebate). */
  selfEmployed: boolean;
}

export interface MiluimOutputs {
  /** Direct tax-free grant (per-day × days). */
  grant: number;
  /** Estimated income-tax saved via extra credit points. */
  taxCreditValue: number;
  /** National-insurance rebate (self-employed only). */
  biturebate: number;
  /** Total estimated benefit. */
  total: number;
  /** Human-readable entitlement bullets. */
  entitlements: string[];
}

// 2024 constants (ILS). Advisor to refresh annually.
const DAILY_GRANT_ILS = 340; // ≈ base grant rate per day (simplified)
const LONG_STRETCH_BONUS = 5000; // extra if single stretch ≥ 60 days
const EXTRA_CREDIT_POINTS_FULL = 0.5; // per-point value × 2,976 ≈ 1,488 ₪/yr
const POINT_VALUE_ANNUAL = 2976;

export function simulateMiluim(i: MiluimInputs): MiluimOutputs {
  const grant =
    i.reserveDays * DAILY_GRANT_ILS + (i.longestStretchDays >= 60 ? LONG_STRETCH_BONUS : 0);

  // Scale extra credit points by days served (max 0.5 points at ≥30 days)
  const pointsEarned = Math.min(EXTRA_CREDIT_POINTS_FULL, (i.reserveDays / 30) * 0.25);
  const taxCreditValue = pointsEarned * POINT_VALUE_ANNUAL;

  // Self-employed NI rebate approximation (real rule: 100% exemption on miluim days)
  const dailyGross = (i.monthlyGross * 12) / 365;
  const biturebate = i.selfEmployed ? dailyGross * i.reserveDays * 0.04 : 0;

  const total = grant + taxCreditValue + biturebate;

  const entitlements: string[] = [
    `מענק ימי מילואים פטור ממס: ${i.reserveDays} ימים × ₪${DAILY_GRANT_ILS}`,
  ];
  if (i.longestStretchDays >= 60) {
    entitlements.push(`בונוס רצף ארוך (60+ ימים): ₪${LONG_STRETCH_BONUS.toLocaleString("en-US")}`);
  }
  entitlements.push(
    `נקודות זיכוי נוספות: ${pointsEarned.toFixed(2)} × ₪${POINT_VALUE_ANNUAL.toLocaleString("en-US")}`
  );
  if (i.selfEmployed) {
    entitlements.push("החזר ביטוח לאומי לעצמאים על ימי מילואים");
  }
  entitlements.push("הנחה בארנונה (בהתאם לרשות המקומית)");
  entitlements.push("דחיית תשלומים לקרן השתלמות/פנסיה ללא קנס");

  return { grant, taxCreditValue, biturebate, total, entitlements };
}
