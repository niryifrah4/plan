/**
 * ═══════════════════════════════════════════════════════════
 *  Mortgage Diagnostics Engine
 * ═══════════════════════════════════════════════════════════
 *
 * Phase 6 (2026-05-21). Generates per-track and per-mortgage insights — the
 * "what would a CFP say about this mortgage" layer that turns raw numbers
 * into actionable advice. Pure functions: takes loaded state, returns a
 * structured list. UI decides how to render.
 *
 * Insight types:
 *   - rate_above_market         track ריבית > שוק + 1%
 *   - prime_margin_high         פריים + מארג'ין > +0.7%
 *   - high_cpi_exposure         מסלול צמוד עם חשיפה משמעותית למדד
 *   - term_past_retirement      תקופת המשכנתא מסתיימת אחרי גיל פרישה
 *   - rate_exposure_skewed      תמהיל המסלולים חשוף מדי לעלייה (>60% פריים)
 *   - ltv_headroom              LTV נמוך — יש הון פנוי לניצול
 *   - ltv_too_high              LTV > 75% — תקרה רגולטורית מתקרבת
 *   - dti_critical              DTI > 40%
 *
 * Each diagnostic includes:
 *   - severity: info / opportunity / warning / critical
 *   - title (one Hebrew line) + detail (longer explanation)
 *   - monthlyImpact / annualImpact when quantifiable
 *   - mortgageId / trackId when scoped to a specific row
 */

import type { DebtData, MortgageData, MortgageTrack } from "./debt-store";
import { effectiveTrackRate, trackCpiRate, getAllMortgageTracks } from "./debt-store";
import { effectiveNominalRate, projectIndexedLoan } from "@shared/financial-math";
import type { Assumptions } from "./assumptions";
import type { Property } from "./realestate-store";

export type DiagnosticSeverity = "info" | "opportunity" | "warning" | "critical";

export type DiagnosticKind =
  | "rate_above_market"
  | "prime_margin_high"
  | "high_cpi_exposure"
  | "term_past_retirement"
  | "rate_exposure_skewed"
  | "ltv_headroom"
  | "ltv_too_high"
  | "dti_critical"
  | "payment_share_high";

export interface MortgageDiagnostic {
  id: string;
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  /** Estimated monthly impact in ₪ (negative = cost, positive = opportunity). */
  monthlyImpact?: number;
  /** Estimated annual / total-life impact in ₪. */
  annualImpact?: number;
  /** When set, the diagnostic targets a specific mortgage on the page. */
  mortgageId?: string;
  /** When set, the diagnostic targets a specific track inside that mortgage. */
  trackId?: string;
  /** Suggested next action — UI may render as a button/link. */
  cta?: string;
}

export interface DiagnosticsInput {
  debt: DebtData;
  assumptions: Assumptions;
  properties: Property[];
  /** Monthly net income, single source of truth from `lib/income.ts`. */
  monthlyNetIncome: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Months between two YYYY-MM strings. Negative = b is before a. */
function monthsBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !by) return 0;
  return (by - ay) * 12 + (bm - am);
}

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Year when the user reaches `retirementAge`, based on stored `currentAge`. */
function retirementYear(a: Assumptions): number | null {
  if (!a.currentAge || !a.retirementAge || a.retirementAge <= a.currentAge) return null;
  const yearsToRetire = a.retirementAge - a.currentAge;
  return new Date().getFullYear() + yearsToRetire;
}

/** Parse track's endDate "YYYY-MM" into the calendar year, or null. */
function trackEndYear(t: MortgageTrack): number | null {
  if (!t.endDate) return null;
  const y = parseInt(t.endDate.split("-")[0], 10);
  return Number.isFinite(y) ? y : null;
}

/* ── Diagnostic rules ────────────────────────────────────────────────── */

/** Track rate substantially above the BoI market average. */
function checkRateAboveMarket(
  mortgage: MortgageData,
  track: MortgageTrack,
  a: Assumptions
): MortgageDiagnostic | null {
  const trackRate = effectiveTrackRate(track, a.primeRate);
  const market = a.avgMortgageRate;
  if (!market || !trackRate) return null;
  const gap = trackRate - market;
  // Threshold: 1.0% above the BoI-published market average. Anything tighter
  // is noise — bank pricing differs by track/term/credit profile.
  if (gap < 0.01) return null;
  // Rough saving: principal × gap × half-life weighted (≈ ½ × remaining term).
  const annualSaving = track.remainingBalance * gap * 0.5;
  return {
    id: `rate_above_market:${track.id}`,
    kind: "rate_above_market",
    severity: gap > 0.02 ? "warning" : "opportunity",
    title: `מסלול "${track.name}" — ריבית גבוהה מהשוק`,
    detail: `הריבית האפקטיבית ${(trackRate * 100).toFixed(2)}% גבוהה ב-${(gap * 100).toFixed(2)}% מהממוצע שפרסם בנק ישראל (${(market * 100).toFixed(2)}%). שווה לבדוק מיחזור. לפני פנייה לבנק חדש — בקשו מהבנק הנוכחי חישוב עמלת פירעון מוקדם; מסלולי קל"צ יכולים לגרור עמלה משמעותית שמבטלת חלק מהחיסכון.`,
    annualImpact: Math.round(annualSaving),
    monthlyImpact: Math.round(annualSaving / 12),
    mortgageId: mortgage.id,
    trackId: track.id,
    cta: "פתח סימולטור מיחזור",
  };
}

/** Prime track stored with a large positive margin. */
function checkPrimeMarginHigh(
  mortgage: MortgageData,
  track: MortgageTrack
): MortgageDiagnostic | null {
  if (typeof track.margin !== "number" || track.margin <= 0.007) return null;
  // Bank-negotiated Prime margins typically run between -0.5% and +0.7%.
  // Anything above +0.7% is a sign the original deal wasn't great.
  return {
    id: `prime_margin_high:${track.id}`,
    kind: "prime_margin_high",
    severity: "opportunity",
    title: `מסלול פריים — מארג'ין +${(track.margin * 100).toFixed(2)}% נחשב גבוה`,
    detail: `מסלולי פריים סטנדרטיים מנוהלים בטווח של -0.5% עד +0.7%. בדוק מול הבנק אפשרות להפחית את המארג'ין דרך מיחזור פנימי.`,
    mortgageId: mortgage.id,
    trackId: track.id,
  };
}

/** Indexed track that adds significant nominal cost via CPI compounding. */
function checkHighCpiExposure(
  mortgage: MortgageData,
  track: MortgageTrack,
  a: Assumptions
): MortgageDiagnostic | null {
  if (track.indexation !== "מדד") return null;
  const realRate = effectiveTrackRate(track, a.primeRate);
  const cpi = trackCpiRate(track, a.inflationRate);
  if (cpi <= 0 || !track.remainingBalance || !track.monthlyPayment) return null;
  const projection = projectIndexedLoan(
    track.remainingBalance,
    track.monthlyPayment,
    realRate,
    cpi
  );
  // Compare nominal interest vs. what a fixed-equivalent would cost.
  const fixedProj = projectIndexedLoan(
    track.remainingBalance,
    track.monthlyPayment,
    realRate,
    0
  );
  const extra = projection.totalInterestNominal - fixedProj.totalInterestNominal;
  if (extra < 20_000) return null;
  return {
    id: `high_cpi_exposure:${track.id}`,
    kind: "high_cpi_exposure",
    severity: extra > 100_000 ? "warning" : "info",
    title: `מסלול "${track.name}" צמוד מדד — חשיפה משמעותית`,
    detail: `בהנחת מדד שנתי של ${(cpi * 100).toFixed(1)}%, הצמדה תוסיף ${extra > 1000 ? `כ-₪${Math.round(extra).toLocaleString("he-IL")}` : `מעט`} לעלות הכוללת לעומת מסלול קבוע באותה ריבית נקובה. ריבית אפקטיבית: ${(effectiveNominalRate(realRate, cpi) * 100).toFixed(2)}%.`,
    annualImpact: Math.round(extra),
    mortgageId: mortgage.id,
    trackId: track.id,
  };
}

/** Mortgage extends past user's retirement year. */
function checkTermPastRetirement(
  mortgage: MortgageData,
  a: Assumptions
): MortgageDiagnostic | null {
  const retYear = retirementYear(a);
  if (!retYear) return null;
  const tracks = mortgage.tracks || [];
  const latestEnd = tracks
    .map(trackEndYear)
    .filter((y): y is number => y !== null)
    .reduce((max, y) => Math.max(max, y), 0);
  if (!latestEnd) return null;
  if (latestEnd <= retYear + 2) return null;
  const yearsPast = latestEnd - retYear;
  const isCritical = yearsPast > 8;
  return {
    id: `term_past_retirement:${mortgage.id}`,
    kind: "term_past_retirement",
    severity: isCritical ? "critical" : "warning",
    title: `המשכנתא מסתיימת אחרי גיל פרישה`,
    detail: `התקופה האחרונה ב-${mortgage.bank || "משכנתא זו"} מסתיימת בשנת ${latestEnd} — ${yearsPast} שנים אחרי גיל הפרישה (${a.retirementAge}). זה עלול לחסום מיחזור עתידי ולהעמיס תשלום על קצבת זקנה.`,
    mortgageId: mortgage.id,
  };
}

/** Mortgage mix is too tilted toward variable/Prime — high exposure to rate hikes. */
function checkRateExposureSkewed(mortgage: MortgageData): MortgageDiagnostic | null {
  const tracks = mortgage.tracks || [];
  const total = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  if (total <= 0 || tracks.length === 0) return null;
  const variableBalance = tracks.reduce((s, t) => {
    const isPrime = typeof t.margin === "number" || /פריים|prime/i.test(t.name || "");
    const isVariable = /משתנה|variable/i.test(t.name || "");
    return s + (isPrime || isVariable ? (t.remainingBalance || 0) : 0);
  }, 0);
  const share = variableBalance / total;
  if (share < 0.6) return null;
  return {
    id: `rate_exposure_skewed:${mortgage.id}`,
    kind: "rate_exposure_skewed",
    severity: share > 0.8 ? "warning" : "info",
    title: `תמהיל המסלולים חשוף לעלייה בריבית`,
    detail: `${Math.round(share * 100)}% מהמשכנתא במסלולים תלויי-פריים או משתנים. בעליית ריבית של 1% — תוספת חודשית מוערכת של כ-₪${Math.round((variableBalance * 0.01) / 12).toLocaleString("he-IL")}. שווה לנעול חלק בקל"צ.`,
    mortgageId: mortgage.id,
  };
}

/** LTV health: too low = unused equity, too high = regulatory ceiling close. */
function checkLtv(
  mortgage: MortgageData,
  properties: Property[]
): MortgageDiagnostic | null {
  const property = mortgage.propertyId
    ? properties.find((p) => p.id === mortgage.propertyId)
    : undefined;
  const propValue = property?.currentValue || mortgage.propertyValue;
  if (!propValue) return null;
  const tracks = mortgage.tracks || [];
  const balance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  if (!balance) return null;
  const ltv = balance / propValue;
  if (ltv > 0.75) {
    return {
      id: `ltv_too_high:${mortgage.id}`,
      kind: "ltv_too_high",
      severity: ltv > 0.85 ? "critical" : "warning",
      title: `LTV גבוה — ${Math.round(ltv * 100)}%`,
      detail: `יחס חוב-לערך נכס מעל 75%. תקרת בנק ישראל למשכנתא ראשונה היא 75%, וירידה בשווי הנכס תיצור גירעון הון. רצוי להאיץ פירעון או להזרים הון.`,
      mortgageId: mortgage.id,
    };
  }
  if (ltv < 0.5) {
    const headroom = propValue * 0.5 - balance;
    return {
      id: `ltv_headroom:${mortgage.id}`,
      kind: "ltv_headroom",
      severity: "info",
      title: `יש לך הון פנוי במשכנתא`,
      detail: `LTV נוכחי ${Math.round(ltv * 100)}%. ניתן לקחת משכנתא נוספת עד תקרה של 50% LTV (כ-₪${Math.round(headroom).toLocaleString("he-IL")}) — אם רלוונטי לרכישת דירה להשקעה או למימון יעד גדול.`,
      annualImpact: Math.round(headroom),
      mortgageId: mortgage.id,
    };
  }
  return null;
}

/* ── Overall (debt-level) checks ─────────────────────────────────────── */

function checkDtiCritical(
  debt: DebtData,
  monthlyNetIncome: number
): MortgageDiagnostic | null {
  if (monthlyNetIncome <= 0) return null;
  const tracks = getAllMortgageTracks(debt);
  const monthlyMortgage = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  const monthlyLoans = (debt.loans || []).reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const monthlyInst = (debt.installments || []).reduce((s, i) => s + (i.monthlyAmount || 0), 0);
  const totalMonthly = monthlyMortgage + monthlyLoans + monthlyInst;
  const dti = totalMonthly / monthlyNetIncome;
  if (dti < 0.4) return null;
  return {
    id: "dti_critical",
    kind: "dti_critical",
    severity: "critical",
    title: `יחס חוב להכנסה (DTI) ${Math.round(dti * 100)}% — קריטי`,
    detail: `התשלום החודשי הכולל על חובות הוא ${Math.round(dti * 100)}% מההכנסה נטו. מעל 40% נחשב למצב לחוץ — בנקים יסרבו אשראי נוסף, וכל אירוע בלתי-צפוי (תיקון, תקופת אבטלה) עלול ליצור פיגור.`,
  };
}

function checkPaymentShare(
  debt: DebtData,
  monthlyNetIncome: number
): MortgageDiagnostic | null {
  if (monthlyNetIncome <= 0) return null;
  const tracks = getAllMortgageTracks(debt);
  const monthlyMortgage = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  if (monthlyMortgage <= 0) return null;
  const share = monthlyMortgage / monthlyNetIncome;
  if (share < 0.3) return null;
  return {
    id: "payment_share_high",
    kind: "payment_share_high",
    severity: share > 0.4 ? "warning" : "info",
    title: `החזר המשכנתא לוקח ${Math.round(share * 100)}% מההכנסה`,
    detail: `ההנחיה הקלאסית של ה-CFP היא לא לעבור 30% החזר משכנתא מההכנסה נטו. בעלייה לריבית של 1% (במסלולים תלויי-פריים) יחס זה יעלה — שקול הקטנת חשיפה.`,
  };
}

/* ── Main entry point ───────────────────────────────────────────────── */

export function generateMortgageDiagnostics(
  input: DiagnosticsInput
): MortgageDiagnostic[] {
  const { debt, assumptions, properties, monthlyNetIncome } = input;
  const diagnostics: MortgageDiagnostic[] = [];

  for (const mortgage of debt.mortgages || []) {
    // Per-mortgage checks
    const termCheck = checkTermPastRetirement(mortgage, assumptions);
    if (termCheck) diagnostics.push(termCheck);
    const skewCheck = checkRateExposureSkewed(mortgage);
    if (skewCheck) diagnostics.push(skewCheck);
    const ltvCheck = checkLtv(mortgage, properties);
    if (ltvCheck) diagnostics.push(ltvCheck);

    // Per-track checks
    for (const track of mortgage.tracks || []) {
      const rateCheck = checkRateAboveMarket(mortgage, track, assumptions);
      if (rateCheck) diagnostics.push(rateCheck);
      const primeCheck = checkPrimeMarginHigh(mortgage, track);
      if (primeCheck) diagnostics.push(primeCheck);
      const cpiCheck = checkHighCpiExposure(mortgage, track, assumptions);
      if (cpiCheck) diagnostics.push(cpiCheck);
    }
  }

  // Overall
  const dti = checkDtiCritical(debt, monthlyNetIncome);
  if (dti) diagnostics.push(dti);
  const payShare = checkPaymentShare(debt, monthlyNetIncome);
  if (payShare) diagnostics.push(payShare);

  // Sort by severity, then by impact magnitude.
  const sevOrder: Record<DiagnosticSeverity, number> = {
    critical: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  };
  diagnostics.sort((a, b) => {
    const so = sevOrder[a.severity] - sevOrder[b.severity];
    if (so !== 0) return so;
    return (b.annualImpact || 0) - (a.annualImpact || 0);
  });

  return diagnostics;
}

// Helper for the UI — touch unused imports defensively.
void currentYM;
void monthsBetween;
