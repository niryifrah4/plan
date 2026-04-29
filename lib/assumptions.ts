/**
 * Verdant Ledger · Global Assumptions Engine
 * Central store for dynamic financial assumptions used across all calculators.
 * Persisted to localStorage — any page can read/update these values.
 */

import { scopedKey } from "./client-scope";

const STORAGE_KEY = "verdant:assumptions";

export interface Assumptions {
  // ── Macro rates (updated manually when BoI changes policy) ──
  boiRate: number;               // ריבית בנק ישראל — e.g. 0.045 = 4.5%
  primeRate: number;             // ריבית הפריים = boiRate + 1.5% (מתעדכן יחד)
  inflationRate: number;         // אינפלציה חזויה, e.g. 0.025 = 2.5%
  macroUpdatedAt?: string;       // ISO timestamp of last macro update (BoI/Prime/Inflation)

  // ── Investment + fees ──
  managementFeePension: number;  // e.g. 0.005 = 0.5%
  managementFeeInvest: number;   // e.g. 0.008 = 0.8%
  expectedReturnPension: number; // e.g. 0.05
  expectedReturnInvest: number;  // e.g. 0.065
  expectedReturnSP500: number;   // e.g. 0.10
  /** Discount rate for NPV / opportunity-cost math. Defaults to boiRate. */
  riskFreeRate: number;          // e.g. 0.04
  safeWithdrawalRate: number;    // e.g. 0.04 (Rule of 300 → 1/300 monthly)

  // ── Personal ──
  retirementAge: number;         // e.g. 67
  currentAge: number;            // e.g. 42
  monthlyIncome: number;         // gross monthly
  monthlyExpenses: number;       // average monthly
  monthlyInvestment: number;     // total monthly savings/investment
  salaryGrowthRate: number;      // e.g. 0.03 = 3% annual salary growth

  // ── קצבת זקנה (ביטוח לאומי) — user-editable ──
  /** Monthly old-age allowance from Bituach Leumi, post-67 (2026 defaults). */
  oldAgeAllowanceMonthly: number;
  /** "single" = יחיד · "couple" = זוג (combined). */
  oldAgeAllowanceStatus: "single" | "couple";

  /**
   * 2026-04-29 per Nir: overall risk tolerance — drives the index-only
   * nudge, model recommendations, and asset-allocation suggestions.
   * Captured from the onboarding step "מוכנות לסיכון". Optional — pages
   * fall back to "moderate" when undefined.
   */
  riskTolerance?: "conservative" | "moderate" | "aggressive";
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  // Macro
  boiRate: 0.045,                // 4.5% — בנק ישראל נכון לתחילת 2026 (ידני)
  primeRate: 0.06,               // 6% = boiRate + 1.5%
  inflationRate: 0.025,          // 2.5%
  macroUpdatedAt: undefined,

  // Investment
  managementFeePension: 0.005,
  managementFeeInvest: 0.008,
  expectedReturnPension: 0.05,
  expectedReturnInvest: 0.07,    // 7% — market average
  expectedReturnSP500: 0.10,
  riskFreeRate: 0.045,           // = boiRate by default
  safeWithdrawalRate: 0.04,

  // Personal — all start at 0 until the user actually sets them.
  // This prevents "ghost" numbers (e.g. ₪28,500) appearing in the dashboard
  // after factory-reset, before the client has entered their real data.
  retirementAge: 67,              // legal Israeli default — keep
  currentAge: 0,
  monthlyIncome: 0,
  monthlyExpenses: 0,
  monthlyInvestment: 0,
  salaryGrowthRate: 0.03,

  // קצבת זקנה — ברירת מחדל יחיד 2026 (~₪1,795). זוג ≈ ₪2,693.
  oldAgeAllowanceMonthly: 1_795,
  oldAgeAllowanceStatus: "single",
};

/** Default monthly old-age allowance by household status (₪, 2026). */
export const OLD_AGE_ALLOWANCE_DEFAULTS = {
  single: 1_795,
  couple: 2_693,
} as const;

/** Margin between Prime rate and Bank of Israel rate (Israeli banking standard). */
export const PRIME_OVER_BOI = 0.015;

/** Read assumptions from localStorage (merge with defaults). */
export function loadAssumptions(): Assumptions {
  if (typeof window === "undefined") return { ...DEFAULT_ASSUMPTIONS };
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_ASSUMPTIONS, ...parsed };
      // Back-compat: if an older user only had riskFreeRate set, derive
      // boiRate + primeRate from it on the fly so the UI isn't empty.
      if (parsed.boiRate === undefined && typeof parsed.riskFreeRate === "number") {
        merged.boiRate = parsed.riskFreeRate;
      }
      if (parsed.primeRate === undefined) {
        merged.primeRate = merged.boiRate + PRIME_OVER_BOI;
      }
      return merged;
    }
  } catch {}
  return { ...DEFAULT_ASSUMPTIONS };
}

/** Save assumptions to localStorage. Dispatches storage event for cross-tab sync. */
export function saveAssumptions(a: Assumptions): void {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(a));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("verdant:assumptions"));
    }
  } catch {}
}

/** Patch specific fields. */
export function patchAssumptions(patch: Partial<Assumptions>): Assumptions {
  const current = loadAssumptions();
  const updated = { ...current, ...patch };
  saveAssumptions(updated);
  return updated;
}

/**
 * Patch macro rates (BoI / Prime / Inflation) in one call and stamp
 * the macroUpdatedAt timestamp. If primeRate is omitted it's derived
 * from boiRate + PRIME_OVER_BOI. riskFreeRate is kept in sync with
 * boiRate unless explicitly overridden.
 */
export function updateMacroRates(patch: {
  boiRate?: number;
  primeRate?: number;
  inflationRate?: number;
  riskFreeRate?: number;
}): Assumptions {
  const current = loadAssumptions();
  const boiRate = patch.boiRate ?? current.boiRate;
  const primeRate = patch.primeRate ?? (patch.boiRate !== undefined
    ? boiRate + PRIME_OVER_BOI
    : current.primeRate);
  const riskFreeRate = patch.riskFreeRate ?? (patch.boiRate !== undefined
    ? boiRate
    : current.riskFreeRate);
  const inflationRate = patch.inflationRate ?? current.inflationRate;

  const updated: Assumptions = {
    ...current,
    boiRate,
    primeRate,
    riskFreeRate,
    inflationRate,
    macroUpdatedAt: new Date().toISOString(),
  };
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
 * Israeli marginal income tax brackets — annual, 2026.
 * Source: רשות המסים, מדרגות מס הכנסה 2026 (לאחר עדכון מדד ינואר).
 * כולל מס יסף 3% מעל ~721,560 ₪ → מדרגה עליונה 50%.
 * Returns { tax, effectiveRate, marginalBracket }.
 *
 * ⚠️ מדרגות אלו מתעדכנות ב-1 בינואר בכל שנה. לעדכן לכשתצא טבלה חדשה.
 */
export const TAX_BRACKETS_2026 = [
  { limit:  84_960, rate: 0.10 },
  { limit: 121_800, rate: 0.14 },
  { limit: 195_600, rate: 0.20 },
  { limit: 271_920, rate: 0.31 },
  { limit: 565_920, rate: 0.35 },
  { limit: 721_560, rate: 0.47 },
  { limit: Infinity, rate: 0.50 },
] as const;

export function israeliIncomeTax(annualIncome: number): {
  tax: number;
  effectiveRate: number;
  marginalBracket: number;
} {
  const brackets = TAX_BRACKETS_2026;

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
 * שכר ממוצע במשק (2026) — בסיס לתקרות ביטוח לאומי/בריאות.
 * לעדכן פעם בשנה (בדרך כלל סביב ינואר).
 */
export const AVG_WAGE_2026 = 13_350;

/* ═══════════════════════════════════════════════════════════
   פטור על קצבה מזכה (סעיף 9א לפקודת מס הכנסה)
   ═══════════════════════════════════════════════════════════
   תקרת הקצבה המזכה × שיעור הפטור = הסכום החודשי הפטור ממס.
   רפורמת "תיקון 190" — עלה בשלבים:
     2012: 43.5%   ·   2016: 49%   ·   2020: 52%   ·   2025: 67%
   שיעור של 67% פעיל מ-01/01/2025.

   הערה חשובה: הפטור נשחק ע"י היוונים / מענקי פרישה פטורים.
   כאן אנו משתמשים בתקרה הרגילה — למשיכת מענק ייעודי יש להפעיל
   את שלילת הפטור בנפרד ("נוסחת הקיזוז").
*/
export const PENSION_ANNUITY_CEILING_2026 = 9_430;
export const PENSION_ANNUITY_EXEMPTION_RATE = 0.67;

/** הסכום החודשי הפטור ממס על קצבה מזכה, אחרי רפורמת תיקון 190. */
export const PENSION_ANNUITY_MONTHLY_EXEMPTION = Math.round(
  PENSION_ANNUITY_CEILING_2026 * PENSION_ANNUITY_EXEMPTION_RATE,
);

/* ═══════════════════════════════════════════════════════════
   סעיפים 45א + 47 — זיכוי/ניכוי על הפקדה וולונטרית (שכיר)
   ═══════════════════════════════════════════════════════════
   עובד שכיר שמפקיד מעבר לחובתו הסטטוטורית (6% עובד) מקבל:
     • סעיף 45א — זיכוי 35% על הפקדה לקצבה/ביטוח חיים,
                  עד 5% מהמשכורת המבוטחת, עד תקרה.
     • סעיף 47  — ניכוי של עד 7% מהמשכורת המבוטחת (מעבר
                  להפקדות שכבר מזכות בזיכוי).
   התקרה לשני הסעיפים: ארבעה × שכר ממוצע במשק
   (2026 ≈ ₪53,400/חודש או ₪640,800/שנה).

   הפקדת חובה של 6% לא נכנסת לחשבון — היא כבר מנוכה מהשכר
   לפני מס. רק הפקדה וולונטרית נוספת זוכה בהטבה.
*/
export const SECTION_45A_CREDIT_RATE = 0.35;   // זיכוי 35%
export const SECTION_45A_PREMIUM_PCT = 0.05;   // עד 5% מהמשכורת המבוטחת
export const SECTION_47_DEDUCTION_PCT = 0.07;  // עד 7% מהמשכורת המבוטחת
/** תקרת המשכורת המבוטחת = 4× שכר ממוצע. */
export const SECTION_45A_47_MONTHLY_CEILING = AVG_WAGE_2026 * 4;

/**
 * מחשב הטבת מס שנתית על הפקדה וולונטרית נוספת לפנסיה/ביטוח חיים (שכיר).
 *
 * @param voluntaryMonthly       הפקדה חודשית נוספת מעבר ל-6% החובה.
 * @param monthlyGross           שכר ברוטו חודשי (לחישוב התקרה האפקטיבית).
 * @param marginalTaxRate        שיעור המס השולי של המפקיד (לחישוב שווי הניכוי).
 */
export function section45and47Benefit(
  voluntaryMonthly: number,
  monthlyGross: number,
  marginalTaxRate: number,
): {
  annualCredit: number;        // הטבת מס שנתית לפי סעיף 45א
  annualDeduction: number;     // הטבת מס שנתית לפי סעיף 47 (ניכוי × שיעור שולי)
  totalAnnual: number;
  maxVoluntaryMonthly: number; // תקרת ההפקדה שמניבה הטבה מלאה לשכר הנוכחי
} {
  // המשכורת המבוטחת מוגבלת ל-4× שכר ממוצע.
  const insuredMonthly = Math.min(Math.max(0, monthlyGross), SECTION_45A_47_MONTHLY_CEILING);

  const max45aAnnual = SECTION_45A_PREMIUM_PCT * insuredMonthly * 12;
  const max47Annual  = SECTION_47_DEDUCTION_PCT * insuredMonthly * 12;
  // בפועל שני הסעיפים פועלים על אותה הפקדה: תחילה 5% זוכים בזיכוי 45א,
  // ומעבר לכך עד 7% זוכים בניכוי 47. לכן התקרה המשולבת היא max(5%,7%) = 7%.
  const maxVoluntaryMonthly = Math.round((max47Annual) / 12);

  const annual = Math.max(0, voluntaryMonthly) * 12;
  const creditBase    = Math.min(annual, max45aAnnual);
  // הניכוי חל רק על מה שמעבר לחלק שקיבל זיכוי (לא צובר פעמיים על אותו שקל).
  const deductionBase = Math.max(0, Math.min(annual, max47Annual) - creditBase);

  const mr = Math.max(0, Math.min(0.5, marginalTaxRate));
  const annualCredit    = creditBase * SECTION_45A_CREDIT_RATE;
  const annualDeduction = deductionBase * mr;

  return {
    annualCredit: Math.round(annualCredit),
    annualDeduction: Math.round(annualDeduction),
    totalAnnual: Math.round(annualCredit + annualDeduction),
    maxVoluntaryMonthly,
  };
}

/**
 * מחשב את המס החודשי המשוער על קצבה.
 *
 * @param grossMonthlyPension  קצבה ברוטו חודשית בשקלים.
 * @param capitalReductionPct  שיעור שלילת הפטור בעקבות היוונים (0–1).
 *                             דוגמה: אם המבוטח היוון ₪300,000 מתוך "נכס הפטור"
 *                             — יש להפחית את הפטור פרופורציונלית.
 * @returns פירוט: פטור חודשי, חלק חייב, ומס משוער (ברקמת 30% ממוצעת לקצבה בשלב זה).
 */
export function pensionAnnuityTax(
  grossMonthlyPension: number,
  capitalReductionPct: number = 0,
): { monthlyExemption: number; taxable: number; estimatedTax: number; effectiveRate: number } {
  const reduction = Math.max(0, Math.min(1, capitalReductionPct));
  const monthlyExemption = Math.round(PENSION_ANNUITY_MONTHLY_EXEMPTION * (1 - reduction));
  const taxable = Math.max(0, grossMonthlyPension - monthlyExemption);
  // Apply the real bracketed tax (מדרגות מס הכנסה) on the annual taxable
  // pension. A cleaner approximation than any flat rate — for a ₪100k
  // taxable annuity it lands in the 10–14% band, not 20%+.
  const annualTax = israeliIncomeTax(taxable * 12).tax;
  const estimatedTax = Math.round(annualTax / 12);
  const effectiveRate = taxable > 0 ? estimatedTax / taxable : 0;
  return { monthlyExemption, taxable, estimatedTax, effectiveRate };
}

/**
 * Bituach Leumi (National Insurance) + בריאות — employee portion only.
 *
 * 2026 rates:
 *   עד 60% משכר ממוצע (~8,010 ₪):
 *     ביטוח לאומי — 0.4% · בריאות — 3.1%  →  3.5% סה"כ
 *   מ-60% עד תקרה (~5× שכר ממוצע ≈ 66,750 ₪):
 *     ביטוח לאומי — 7.0% · בריאות — 5.0%  →  12.0% סה"כ
 *
 * Note: חלק המעסיק אינו כלול כאן (הוא לא "מנוכה" מהעובד).
 */
export function bituachLeumiEstimate(monthlyGross: number): {
  monthly: number;
  annual: number;
  healthMonthly: number;
  nationalInsuranceMonthly: number;
} {
  const avgWage = AVG_WAGE_2026;
  const lowLimit = avgWage * 0.6;
  const highLimit = avgWage * 5;

  const low = Math.min(monthlyGross, lowLimit);
  const high = Math.max(0, Math.min(monthlyGross, highLimit) - lowLimit);

  // Low tier: 0.4% NI + 3.1% health; High tier: 7.0% NI + 5.0% health.
  const nationalInsuranceMonthly = low * 0.004 + high * 0.070;
  const healthMonthly = low * 0.031 + high * 0.050;
  const monthly = nationalInsuranceMonthly + healthMonthly;

  return {
    monthly,
    annual: monthly * 12,
    healthMonthly,
    nationalInsuranceMonthly,
  };
}
