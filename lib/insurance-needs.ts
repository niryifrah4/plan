/**
 * ═══════════════════════════════════════════════════════════
 *  Insurance Needs Engine — מנוע חישוב צרכי כיסוי ביטוחי
 * ═══════════════════════════════════════════════════════════
 *
 * Built 2026-05-19 — closes the biggest gap in the risk-management page:
 * the checklist used to ask only "yes/no" per coverage. This engine now
 * computes for each of the four headline risks how much coverage the
 * household actually needs, how much they have, and where the gap is.
 *
 * Four risk categories computed:
 *   1. Life          — DIME (Debt + Income + Mortgage + Education)
 *   2. Disability    — 75% income replacement (Israeli legal max)
 *   3. Nursing       — ₪10K/month target, less urgent under age 50
 *   4. Critical      — 6–12 months of income lump sum
 *
 * Pure functions. No React. Reads from existing assumptions / debt /
 * pension stores; one new store (`insurance-profile`) for inputs that
 * the rest of the system doesn't already know.
 *
 * Israeli-specific defaults — verified against 2026 figures.
 */

import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

/* ═══════════════════════════════════════════════════════════
   Profile — the inputs the rest of the system doesn't know
   ═══════════════════════════════════════════════════════════ */

export interface InsuranceProfile {
  /**
   * How many years to replace income for the surviving spouse on death.
   *   - "until_kids_22"  → until the youngest child reaches 22 (most common)
   *   - "until_retirement" → until the deceased would have retired
   *   - "custom"         → user-specified `yearsToReplaceCustom`
   */
  yearsToReplaceMode: "until_kids_22" | "until_retirement" | "custom";
  yearsToReplaceCustom?: number;

  /** Planned education cost per child (₪). Default ₪200,000 covers a basic
   *  Israeli undergrad path. Real planning often goes to ₪400-500K. */
  educationCostPerKid: number;

  /** Total existing private life-insurance face amount (₪) across all policies. */
  privateLifeAmount: number;

  /** % of monthly income covered by private אכ"ע (0–75). Most pensions cover
   *  ~75% of pensionable salary; this fills in private policies on top. */
  privateDisabilityIncomePct: number;

  /** Existing private nursing benefit (₪/month). */
  privateNursingMonthly: number;

  /** Existing private critical-illness lump sum (₪). */
  privateCriticalLumpSum: number;

  /**
   * Whether the household has ביטוח חיים למשכנתא. In Israel this is
   * essentially mandatory for any mortgage and we default to true; the
   * advisor can clear it if a client somehow doesn't have it.
   */
  hasMortgageLifeInsurance: boolean;

  /**
   * Disability policy quality:
   *   - "occupational" (עיסוקי) — pays if you can't perform your specific job
   *   - "general"      (כללי)   — pays only if you can't work at all
   * Most pension defaults are "general" — flag this if the household has
   * a private upgrade.
   */
  disabilityType: "occupational" | "general";

  /** Override BTL survivors monthly benefit (₪). When undefined we estimate
   *  from the number of children + 2026 base rates. */
  btlSurvivorsMonthlyOverride?: number;
}

export const DEFAULT_INSURANCE_PROFILE: InsuranceProfile = {
  yearsToReplaceMode: "until_kids_22",
  educationCostPerKid: 200_000,
  privateLifeAmount: 0,
  privateDisabilityIncomePct: 0,
  privateNursingMonthly: 0,
  privateCriticalLumpSum: 0,
  hasMortgageLifeInsurance: true,
  disabilityType: "general",
};

/* ── Storage ── */

const STORAGE_KEY = "verdant:insurance_profile";
const BLOB_KEY = "insurance_profile";
export const INSURANCE_PROFILE_EVENT = "verdant:insurance_profile:updated";

export function loadInsuranceProfile(): InsuranceProfile {
  if (typeof window === "undefined") return { ...DEFAULT_INSURANCE_PROFILE };
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_INSURANCE_PROFILE, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_INSURANCE_PROFILE };
}

export function saveInsuranceProfile(p: InsuranceProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(p));
    window.dispatchEvent(new Event(INSURANCE_PROFILE_EVENT));
    pushBlobInBackground(BLOB_KEY, p);
  } catch {}
}

export async function hydrateInsuranceProfileFromRemote(): Promise<boolean> {
  const remote = await pullBlob<InsuranceProfile>(BLOB_KEY);
  if (!remote) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(INSURANCE_PROFILE_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   Context — derived from the rest of the system
   ═══════════════════════════════════════════════════════════ */

export interface NeedsContext {
  monthlyIncome: number;
  monthlyExpenses: number;
  currentAge: number;
  retirementAge: number;
  /** Total outstanding mortgage balance across all mortgages (₪). */
  mortgageBalance: number;
  /** Non-mortgage debt: loans + installments aggregated (₪). */
  nonMortgageDebt: number;
  /** Ages of every child in the household. */
  kidsAges: number[];
  /** Any pension fund flagged with death insurance cover. */
  pensionDeathCovered: boolean;
  /** Any pension fund flagged with disability (אכ"ע) cover. */
  pensionDisabilityCovered: boolean;
  /** Any pension fund flagged with nursing cover. */
  pensionNursingCovered: boolean;
  /** Months of monthly-expenses covered by emergency cash. Used to soften
   *  critical-illness severity for households with strong reserves. */
  emergencyMonths: number;
}

/* ═══════════════════════════════════════════════════════════
   Israeli 2026 constants
   ═══════════════════════════════════════════════════════════ */

/** שכר ממוצע במשק 2026. Synced with assumptions.ts. */
const AVG_WAGE_2026 = 13_566;

/**
 * Legal cap on pensionable salary in קרן פנסיה חדשה: 2× שכר ממוצע.
 * Above this, pension disability cover stops — gap must be filled privately.
 */
const PENSION_DISABILITY_SALARY_CAP = AVG_WAGE_2026 * 2; // ≈ ₪26,700

/** Legal max disability benefit in Israel: 75% of income. */
const DISABILITY_REPLACEMENT_RATE = 0.75;

/**
 * Standard nursing-cost target (₪/month). Institutional care 2026 runs
 * ₪15-20K; home care ₪8-12K. ₪10K is a sensible planning anchor.
 */
const NURSING_TARGET_MONTHLY = 10_000;

/**
 * קופ"ח שב"ן basic nursing benefit baseline (₪/month, after 60).
 * Source: ביטוח סיעודי קבוצתי אחיד של קופות החולים 2026 — average payout
 * is ₪3,000-6,000 with eligibility conditions (3 ADL impairment, 3-month
 * waiting period, 5-year payout cap on basic policies). ₪3,500 is the
 * conservative planning anchor recommended by finance-agent (2026-05-19).
 */
const HEALTHFUND_NURSING_MONTHLY = 3_500;

/** Heuristic pension nursing rider benefit when the cover flag is on. */
const PENSION_NURSING_BENEFIT = 3_000;

/** Months of income recommended for critical-illness lump sum. */
const CRITICAL_ILLNESS_MONTHS = 12;

/**
 * Heuristic pension death cover when the flag is on but no ₪ amount is
 * recorded. Israeli pension funds typically promise survivors ~24–60×
 * monthly salary depending on years to retirement. 24× is the floor.
 */
const PENSION_DEATH_MONTHS_OF_SALARY = 24;

/* ═══════════════════════════════════════════════════════════
   Bituach Leumi — קצבת שאירים estimate (₪/month, 2026)
   ═══════════════════════════════════════════════════════════
   Source: btl.gov.il official 2026 schedule (verified by finance-agent
   2026-05-19). Real structure is widow's base + per-child supplement —
   not a simple per-count ladder. We default to age 50+ widow base when
   no age is available; advisor can override via the profile.
   ⚠️ Refresh when ביטוח לאומי updates rates each January.
*/
function estimateBtlSurvivors(kidsCount: number): number {
  if (kidsCount <= 0) return 1_838; // אלמן/ה גיל 50+ ללא ילדים (conservative default)
  if (kidsCount === 1) return 2_700;
  if (kidsCount === 2) return 3_562;
  return 3_562 + (kidsCount - 2) * 862; // +₪862 per additional kid (2026 rate)
}

/* ═══════════════════════════════════════════════════════════
   Results
   ═══════════════════════════════════════════════════════════ */

export type NeedSeverity = "ok" | "warning" | "critical";

export interface NeedBreakdownLine {
  label: string;
  amount: number;
  /** True if this line is *existing coverage* (subtracted from required);
   *  false if it's a required component (adds to required). */
  isExisting: boolean;
  /** Optional note shown under the line. */
  note?: string;
}

export interface NeedResult {
  category: "life" | "disability" | "nursing" | "critical";
  label: string;
  icon: string;
  required: number;
  existing: number;
  gap: number;
  severity: NeedSeverity;
  /** Lump sum (life/nursing/critical) vs Monthly (disability) — drives display. */
  unit: "lump" | "monthly";
  breakdown: NeedBreakdownLine[];
  recommendation: string;
}

export interface InsuranceNeedsReport {
  results: NeedResult[];
  /** Sum of all lump-sum gaps (life + critical). */
  totalLumpSumGap: number;
  /** Monthly gap for disability (separate axis from lump sums). */
  monthlyDisabilityGap: number;
  /** Monthly gap for nursing (separate axis). */
  monthlyNursingGap: number;
  /** One-sentence headline summary. */
  summary: string;
  overallSeverity: NeedSeverity;
  /** How many checklist rows fed the engine (when riskItems are passed). */
  derivedFromChecklist: number;
}

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function computeYearsToReplace(p: InsuranceProfile, ctx: NeedsContext): number {
  if (p.yearsToReplaceMode === "custom" && p.yearsToReplaceCustom != null) {
    return Math.max(1, p.yearsToReplaceCustom);
  }
  if (p.yearsToReplaceMode === "until_retirement") {
    return Math.max(1, ctx.retirementAge - ctx.currentAge);
  }
  // until_kids_22
  if (ctx.kidsAges.length === 0) {
    // No kids — fall back to a 10-year horizon (industry rule of thumb for
    // a couple without dependents).
    return 10;
  }
  const youngest = Math.min(...ctx.kidsAges);
  return Math.max(0, 22 - youngest);
}

function severityFromCoverage(coveragePct: number): NeedSeverity {
  if (coveragePct >= 0.9) return "ok";
  if (coveragePct >= 0.5) return "warning";
  return "critical";
}

/* ═══════════════════════════════════════════════════════════
   Category 1 — Life Insurance (ביטוח חיים) · DIME
   ═══════════════════════════════════════════════════════════ */

function computeLifeNeed(p: InsuranceProfile, ctx: NeedsContext): NeedResult {
  const yearsToReplace = computeYearsToReplace(p, ctx);
  const annualIncome = ctx.monthlyIncome * 12;
  const incomeReplacement = annualIncome * yearsToReplace;
  const educationTotal = p.educationCostPerKid * ctx.kidsAges.length;
  const mortgageComponent = p.hasMortgageLifeInsurance ? 0 : ctx.mortgageBalance;
  const debtComponent = ctx.nonMortgageDebt;

  const required = incomeReplacement + mortgageComponent + debtComponent + educationTotal;

  /* Existing coverage */
  const pensionDeath = ctx.pensionDeathCovered
    ? ctx.monthlyIncome * PENSION_DEATH_MONTHS_OF_SALARY
    : 0;
  const mortgageLifeCover = p.hasMortgageLifeInsurance ? ctx.mortgageBalance : 0;
  const btlMonthly =
    p.btlSurvivorsMonthlyOverride ?? estimateBtlSurvivors(ctx.kidsAges.length);
  const btlPV = btlMonthly * 12 * yearsToReplace;

  const existing = p.privateLifeAmount + pensionDeath + mortgageLifeCover + btlPV;
  const gap = Math.max(0, required - existing);
  const coverage = required > 0 ? Math.min(1, existing / required) : 1;
  const severity = severityFromCoverage(coverage);

  const breakdown: NeedBreakdownLine[] = [
    {
      label: `החלפת הכנסה (${yearsToReplace} שנים)`,
      amount: incomeReplacement,
      isExisting: false,
      note: `${Math.round(ctx.monthlyIncome).toLocaleString("he-IL")} ₪ × 12 × ${yearsToReplace}`,
    },
  ];
  if (debtComponent > 0) {
    breakdown.push({ label: "חובות (הלוואות + תשלומים)", amount: debtComponent, isExisting: false });
  }
  if (educationTotal > 0) {
    breakdown.push({
      label: `חינוך ילדים (${ctx.kidsAges.length} ילדים)`,
      amount: educationTotal,
      isExisting: false,
      note: `${p.educationCostPerKid.toLocaleString("he-IL")} ₪ × ${ctx.kidsAges.length}`,
    });
  }
  if (mortgageComponent > 0) {
    breakdown.push({
      label: "יתרת משכנתא (אין ביטוח משכנתא)",
      amount: mortgageComponent,
      isExisting: false,
    });
  }
  if (p.privateLifeAmount > 0) {
    breakdown.push({ label: "ביטוח חיים פרטי", amount: p.privateLifeAmount, isExisting: true });
  }
  if (pensionDeath > 0) {
    breakdown.push({
      label: "ביטוח חיים בפנסיה (אומדן)",
      amount: pensionDeath,
      isExisting: true,
      note: `${PENSION_DEATH_MONTHS_OF_SALARY} חודשי שכר — לאמת מול הדוח השנתי`,
    });
  }
  if (mortgageLifeCover > 0) {
    breakdown.push({
      label: "ביטוח חיים למשכנתא",
      amount: mortgageLifeCover,
      isExisting: true,
    });
  }
  if (btlPV > 0) {
    breakdown.push({
      label: "קצבת שאירים (ביטוח לאומי) — היוון",
      amount: btlPV,
      isExisting: true,
      note: `${Math.round(btlMonthly).toLocaleString("he-IL")} ₪ × 12 × ${yearsToReplace}`,
    });
  }

  const recommendation =
    gap === 0
      ? "הכיסוי תואם או עולה על הצורך — תקין."
      : severity === "critical"
        ? `פער מהותי של ${Math.round(gap).toLocaleString("he-IL")} ₪. שקול ביטוח חיים פרטי (ריסק) להשלמת ההפרש — פוליסת ריסק לבן/בת 30+ עולה בד״כ ₪50-150/חודש למיליון ₪ כיסוי.`
        : `פער של ${Math.round(gap).toLocaleString("he-IL")} ₪ — שווה לסגור בפוליסת ריסק קצרת-טווח עד שהילדים גדלים.`;

  return {
    category: "life",
    label: "ביטוח חיים",
    icon: "favorite",
    required,
    existing,
    gap,
    severity,
    unit: "lump",
    breakdown,
    recommendation,
  };
}

/* ═══════════════════════════════════════════════════════════
   Category 2 — Disability (אובדן כושר עבודה)
   ═══════════════════════════════════════════════════════════ */

function computeDisabilityNeed(p: InsuranceProfile, ctx: NeedsContext): NeedResult {
  const required = ctx.monthlyIncome * DISABILITY_REPLACEMENT_RATE;

  /* Pension disability — capped at 75% of pensionable salary, up to legal cap */
  const pensionDisability = ctx.pensionDisabilityCovered
    ? Math.min(ctx.monthlyIncome, PENSION_DISABILITY_SALARY_CAP) * DISABILITY_REPLACEMENT_RATE
    : 0;

  const privateDisability = ctx.monthlyIncome * Math.min(75, p.privateDisabilityIncomePct) / 100;
  const existing = pensionDisability + privateDisability;
  const gap = Math.max(0, required - existing);
  const coverage = required > 0 ? Math.min(1, existing / required) : 1;

  /* Quality nudge: even if covered numerically, "general" disability is
     a much weaker policy than "occupational" for higher-earning households. */
  let severity = severityFromCoverage(coverage);
  if (severity === "ok" && p.disabilityType === "general" && ctx.monthlyIncome >= 25_000) {
    severity = "warning";
  }

  const breakdown: NeedBreakdownLine[] = [
    {
      label: "75% מההכנסה החודשית",
      amount: required,
      isExisting: false,
      note: `${Math.round(ctx.monthlyIncome).toLocaleString("he-IL")} ₪ × 75%`,
    },
  ];
  if (pensionDisability > 0) {
    const aboveCap = ctx.monthlyIncome > PENSION_DISABILITY_SALARY_CAP;
    breakdown.push({
      label: "אכ״ע בפנסיה",
      amount: pensionDisability,
      isExisting: true,
      note: aboveCap
        ? `מוגבל לתקרת שכר ${PENSION_DISABILITY_SALARY_CAP.toLocaleString("he-IL")} ₪ — מעל לכך לא מכוסה`
        : undefined,
    });
  }
  if (privateDisability > 0) {
    breakdown.push({
      label: `אכ״ע פרטי (${p.privateDisabilityIncomePct}% מהשכר)`,
      amount: privateDisability,
      isExisting: true,
      note: p.disabilityType === "occupational" ? "פוליסה עיסוקית — איכותית" : undefined,
    });
  }

  let recommendation: string;
  if (gap === 0 && severity === "ok") {
    recommendation = "75% מההכנסה מכוסים — תקין.";
  } else if (gap === 0 && severity === "warning") {
    recommendation =
      "הכיסוי הכמותי תקין אבל הוא מסוג 'כללי' — בעל הכנסה גבוהה צריך שדרוג לפוליסה עיסוקית.";
  } else if (ctx.monthlyIncome > PENSION_DISABILITY_SALARY_CAP) {
    recommendation = `ההכנסה מעל תקרת השכר הפנסיוני (${PENSION_DISABILITY_SALARY_CAP.toLocaleString("he-IL")} ₪). פער של ${Math.round(gap).toLocaleString("he-IL")} ₪/חודש לא מכוסה — דרושה פוליסת אכ״ע פרטית להשלמה.`;
  } else {
    recommendation = `פער של ${Math.round(gap).toLocaleString("he-IL")} ₪/חודש. פוליסה פרטית להשלמה — שווה לבדוק במיוחד אם העיסוק מצריך מומחיות ספציפית.`;
  }

  return {
    category: "disability",
    label: "אובדן כושר עבודה",
    icon: "accessible",
    required,
    existing,
    gap,
    severity,
    unit: "monthly",
    breakdown,
    recommendation,
  };
}

/* ═══════════════════════════════════════════════════════════
   Category 3 — Nursing (סיעוד)
   ═══════════════════════════════════════════════════════════ */

function computeNursingNeed(p: InsuranceProfile, ctx: NeedsContext): NeedResult {
  const required = NURSING_TARGET_MONTHLY;
  const pensionNursing = ctx.pensionNursingCovered ? PENSION_NURSING_BENEFIT : 0;
  const healthFundBaseline = HEALTHFUND_NURSING_MONTHLY;
  const existing = pensionNursing + healthFundBaseline + p.privateNursingMonthly;
  const gap = Math.max(0, required - existing);
  const coverage = required > 0 ? Math.min(1, existing / required) : 1;

  /* Severity: under 50, nursing is "planning" not "urgent". A gap = warning at
     most. Above 50, the picture matters now. */
  let severity = severityFromCoverage(coverage);
  if (ctx.currentAge < 50 && severity === "critical") severity = "warning";

  const breakdown: NeedBreakdownLine[] = [
    {
      label: "תקציב סיעוד מומלץ",
      amount: required,
      isExisting: false,
      note: "מטפל בית/מוסד — אומדן 2026",
    },
    {
      label: 'שב"ן (קופת חולים) — בסיסי',
      amount: healthFundBaseline,
      isExisting: true,
      note: "מותנה בעמידה בתנאים בעת מקרה ביטוח",
    },
  ];
  if (pensionNursing > 0) {
    breakdown.push({
      label: "סיעוד דרך פנסיה",
      amount: pensionNursing,
      isExisting: true,
      note: "אומדן — לאמת בפוליסה",
    });
  }
  if (p.privateNursingMonthly > 0) {
    breakdown.push({
      label: "סיעוד פרטי",
      amount: p.privateNursingMonthly,
      isExisting: true,
    });
  }

  const recommendation =
    gap === 0
      ? "הכיסוי הסיעודי תקין."
      : ctx.currentAge < 45
        ? `כיום פערים פחות דחופים — אבל פרמיית סיעוד גדלה משמעותית אחרי גיל 45. שווה לשקול פוליסה צעירה ולנעול תעריף.`
        : ctx.currentAge < 55
          ? `פער של ${Math.round(gap).toLocaleString("he-IL")} ₪/חודש. בגיל הזה הפרמיה עוד סבירה — זמן טוב להוסיף כיסוי.`
          : `פער של ${Math.round(gap).toLocaleString("he-IL")} ₪/חודש. סיעוד הוא הסיכון הכי יקר לטפל בו אחרי 60. עדיף לסגור כעת.`;

  return {
    category: "nursing",
    label: "סיעוד",
    icon: "elderly",
    required,
    existing,
    gap,
    severity,
    unit: "monthly",
    breakdown,
    recommendation,
  };
}

/* ═══════════════════════════════════════════════════════════
   Category 4 — Critical Illness (מחלות קשות)
   ═══════════════════════════════════════════════════════════ */

function computeCriticalNeed(p: InsuranceProfile, ctx: NeedsContext): NeedResult {
  const required = ctx.monthlyIncome * CRITICAL_ILLNESS_MONTHS;
  const existing = p.privateCriticalLumpSum;
  const gap = Math.max(0, required - existing);
  const coverage = required > 0 ? Math.min(1, existing / required) : 1;

  /* A strong emergency fund (6+ months) softens criticality — the household
     can self-insure for the short-term income shock during treatment. */
  let severity = severityFromCoverage(coverage);
  if (severity === "critical" && ctx.emergencyMonths >= 6) severity = "warning";

  const breakdown: NeedBreakdownLine[] = [
    {
      label: `${CRITICAL_ILLNESS_MONTHS} חודשי הכנסה`,
      amount: required,
      isExisting: false,
      note: `${Math.round(ctx.monthlyIncome).toLocaleString("he-IL")} ₪ × ${CRITICAL_ILLNESS_MONTHS}`,
    },
  ];
  if (existing > 0) {
    breakdown.push({
      label: "ביטוח מחלות קשות פרטי",
      amount: existing,
      isExisting: true,
    });
  }
  if (ctx.emergencyMonths >= 6) {
    breakdown.push({
      label: `קרן חירום (${ctx.emergencyMonths.toFixed(1)} חודשי הוצאות)`,
      amount: ctx.monthlyExpenses * Math.min(12, ctx.emergencyMonths),
      isExisting: true,
      note: "מקטינה דחיפות — לא מחליפה ביטוח",
    });
  }

  const recommendation =
    gap === 0
      ? "כיסוי תקין למחלות קשות."
      : ctx.emergencyMonths >= 6
        ? `יש לכם קרן חירום של ${ctx.emergencyMonths.toFixed(1)} חודשים — שווה לבדוק האם פוליסת מחלות קשות נחוצה או שמעדיפים לחסוך את הפרמיה ולסמוך על הקרן.`
        : `פער של ${Math.round(gap).toLocaleString("he-IL")} ₪. במחלות קשות הכסף הולך לתרופות שלא בסל ולתקופת אי-עבודה — פוליסה ב-₪150-300/חודש נותנת ₪200-500K כיסוי.`;

  return {
    category: "critical",
    label: "מחלות קשות",
    icon: "emergency",
    required,
    existing,
    gap,
    severity,
    unit: "lump",
    breakdown,
    recommendation,
  };
}

/* ═══════════════════════════════════════════════════════════
   Orchestrator
   ═══════════════════════════════════════════════════════════ */

export function computeInsuranceNeeds(
  profile: InsuranceProfile,
  ctx: NeedsContext,
  /**
   * When the caller passes the household's risk-checklist items, the engine
   * derives the four "private coverage" fields from the checklist instead of
   * the manually-saved profile (the advisor edits coverages in one place).
   * Counted derivations are exposed on the report so the UI can surface a
   * "X כיסויים נטענו מהצ׳קליסט" badge.
   */
  riskItems?: ChecklistItem[]
): InsuranceNeedsReport {
  const derived = riskItems ? deriveProfileFromChecklist(riskItems, ctx) : null;
  const effectiveProfile: InsuranceProfile = derived
    ? { ...profile, ...derived.fields }
    : profile;

  const results: NeedResult[] = [
    computeLifeNeed(effectiveProfile, ctx),
    computeDisabilityNeed(effectiveProfile, ctx),
    computeNursingNeed(effectiveProfile, ctx),
    computeCriticalNeed(effectiveProfile, ctx),
  ];

  const totalLumpSumGap = results
    .filter((r) => r.unit === "lump")
    .reduce((s, r) => s + r.gap, 0);
  const monthlyDisabilityGap = results.find((r) => r.category === "disability")?.gap || 0;
  const monthlyNursingGap = results.find((r) => r.category === "nursing")?.gap || 0;

  const critical = results.filter((r) => r.severity === "critical").length;
  const warnings = results.filter((r) => r.severity === "warning").length;
  const overallSeverity: NeedSeverity =
    critical > 0 ? "critical" : warnings > 0 ? "warning" : "ok";

  const summary =
    overallSeverity === "ok"
      ? "תיק הביטוח של המשפחה מאוזן — אין פערים מהותיים."
      : overallSeverity === "critical"
        ? `זוהו ${critical} פערים מהותיים בכיסוי הביטוחי שדורשים פעולה.`
        : `הכיסוי הביטוחי סביר אבל ניתן לשפר — ${warnings} נקודות לבדיקה.`;

  return {
    results,
    totalLumpSumGap,
    monthlyDisabilityGap,
    monthlyNursingGap,
    summary,
    overallSeverity,
    derivedFromChecklist: derived?.matchedCount ?? 0,
  };
}

/* ═══════════════════════════════════════════════════════════
   Checklist → Profile derivation
   ═══════════════════════════════════════════════════════════
   Maps private-coverage rows from the risk-management checklist
   (risk-store) onto the four "existing coverage" fields the engine
   needs. Pension-level rows are intentionally NOT mapped — those
   come from the pension-store `insuranceCover` flags so we avoid
   double-counting.

   Matching is label-based with Hebrew keywords. Custom rows the
   advisor adds will only match if their label contains the right
   keywords (e.g. "פרטי", "ריסק", "משכנתא").
*/

/** Minimal shape of a checklist row — kept here to avoid a circular
 *  import with risk-store. The full RiskItem type extends this. */
export interface ChecklistItem {
  category: string;
  label: string;
  status: "covered" | "partial" | "missing" | "not_relevant";
  coverageAmount?: number;
}

function isActive(status: ChecklistItem["status"]): boolean {
  return status === "covered" || status === "partial";
}

/**
 * Aggregate private-coverage rows from the checklist into a partial
 * InsuranceProfile. Multiple matching rows are summed (e.g. two private
 * life policies of ₪500K each → ₪1,000,000).
 */
export function deriveProfileFromChecklist(
  items: ChecklistItem[],
  ctx: { monthlyIncome: number }
): {
  fields: Partial<InsuranceProfile>;
  matchedCount: number;
  matches: { profileField: keyof InsuranceProfile; label: string; value: number }[];
} {
  let privateLifeAmount = 0;
  let privateNursingMonthly = 0;
  let privateCriticalLumpSum = 0;
  let privateDisabilityPct = 0;
  let hasMortgageLifeInsurance = false;
  let mortgageRowSeen = false;
  const matches: { profileField: keyof InsuranceProfile; label: string; value: number }[] = [];

  for (const item of items) {
    if (item.status === "not_relevant") continue;
    const amt = item.coverageAmount || 0;

    // ── Mortgage life — boolean derivation ──
    // Match category=death AND label contains "משכנתא". Status active = true.
    if (item.category === "death" && /משכנתא/.test(item.label)) {
      mortgageRowSeen = true;
      if (isActive(item.status)) {
        hasMortgageLifeInsurance = true;
        matches.push({
          profileField: "hasMortgageLifeInsurance",
          label: item.label,
          value: 1,
        });
      }
      continue;
    }

    // Only "active" coverage contributes — skip missing rows.
    if (!isActive(item.status)) continue;

    // ── Private life insurance ──
    // Match category=death AND label contains "פרטי" or "ריסק". Excludes
    // "דרך קרן פנסיה" / "ביטוח לאומי" since those are covered by other
    // engine inputs.
    if (
      item.category === "death" &&
      /פרטי|ריסק/.test(item.label) &&
      !/פנסיה|לאומי|מסלקה/.test(item.label)
    ) {
      privateLifeAmount += amt;
      if (amt > 0) {
        matches.push({ profileField: "privateLifeAmount", label: item.label, value: amt });
      }
      continue;
    }

    // ── Private disability (אכ"ע) ──
    // Match category=disability AND label contains "פרטי" or "עצמאי".
    // coverageAmount is interpreted as monthly benefit in ₪.
    if (item.category === "disability" && /פרטי|עצמאי/.test(item.label)) {
      if (amt > 0 && ctx.monthlyIncome > 0) {
        const pct = Math.min(75, (amt / ctx.monthlyIncome) * 100);
        privateDisabilityPct += pct;
        matches.push({ profileField: "privateDisabilityIncomePct", label: item.label, value: amt });
      }
      continue;
    }

    // ── Private nursing ──
    // Match category=nursing AND label contains "פרטי".
    // coverageAmount = monthly benefit.
    if (item.category === "nursing" && /פרטי/.test(item.label)) {
      privateNursingMonthly += amt;
      if (amt > 0) {
        matches.push({ profileField: "privateNursingMonthly", label: item.label, value: amt });
      }
      continue;
    }

    // ── Critical illness — primary insured ──
    // Match category=critical, exclude spouse/kids rows (advisor models them
    // as separate household members in a future phase).
    if (
      item.category === "critical" &&
      /מבוטח ראשי|פרטי/.test(item.label) &&
      !/זוג|ילדים/.test(item.label)
    ) {
      privateCriticalLumpSum += amt;
      if (amt > 0) {
        matches.push({ profileField: "privateCriticalLumpSum", label: item.label, value: amt });
      }
    }
  }

  privateDisabilityPct = Math.min(75, Math.max(0, privateDisabilityPct));

  /* Mortgage row default: if the checklist has no "ביטוח חיים דרך משכנתא"
     row at all, fall back to the profile's manual `hasMortgageLifeInsurance`
     value by leaving it unset in the returned fields. */
  const fields: Partial<InsuranceProfile> = {
    privateLifeAmount,
    privateDisabilityIncomePct: privateDisabilityPct,
    privateNursingMonthly,
    privateCriticalLumpSum,
  };
  if (mortgageRowSeen) {
    fields.hasMortgageLifeInsurance = hasMortgageLifeInsurance;
  }

  return { fields, matchedCount: matches.length, matches };
}
