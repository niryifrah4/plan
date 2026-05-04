/**
 * Salary Engine — Israeli 2026 gross → net breakdown.
 *
 * Single source of truth for compensation. Takes a gross salary profile
 * (base, bonus, pension %, study fund %, credit points) and returns a
 * complete breakdown: taxable income, income tax, bituach leumi, health tax,
 * pension deductions, study fund deductions, and net take-home.
 *
 * Persisted per-client in localStorage under `verdant:salary_profile`.
 */

import { scopedKey } from "@/lib/client-scope";
import { israeliIncomeTax, bituachLeumiEstimate, AVG_WAGE_2026 } from "@/lib/assumptions";

/* ═══════════════════════════════════════════════════════════
   Profile shape
   ═══════════════════════════════════════════════════════════ */

export interface SalaryProfile {
  /** Monthly gross salary before any deductions (ברוטו). */
  monthlyGross: number;
  /** Annual gross bonus (expected, in ₪). Default 0. */
  annualBonus: number;
  /** Income tax credit points (נקודות זיכוי). Default 2.25 (basic resident). */
  creditPoints: number;
  /** Pension deduction % by party. Israeli defaults: 6 / 6.5 / 6. */
  pensionEmployeePct: number;
  pensionEmployerPct: number;
  pensionSeverancePct: number;
  /** Study fund (קרן השתלמות) — employee/employer. Defaults 2.5 / 7.5 (max benefit). */
  studyFundEmployeePct: number;
  studyFundEmployerPct: number;
  /** Optional: peripheral town tax benefit % (הטבת מס יישובים), 0–12. */
  peripheryBenefitPct: number;
  /** Stored to detect if profile was ever explicitly saved vs. defaults. */
  savedAt?: string;
}

export const DEFAULT_SALARY_PROFILE: SalaryProfile = {
  monthlyGross: 0,
  annualBonus: 0,
  creditPoints: 2.25,
  pensionEmployeePct: 6.0,
  pensionEmployerPct: 6.5,
  pensionSeverancePct: 6.0,
  studyFundEmployeePct: 2.5,
  studyFundEmployerPct: 7.5,
  peripheryBenefitPct: 0,
};

const STORAGE_KEY = "verdant:salary_profile";
export const SALARY_PROFILE_EVENT = "verdant:salary_profile:updated";

/* ═══════════════════════════════════════════════════════════
   Breakdown result
   ═══════════════════════════════════════════════════════════ */

export interface SalaryBreakdown {
  /** Inputs echoed for convenience. */
  monthlyGross: number;
  annualGross: number; // includes annualized bonus
  /** Taxable income after pension deduction (pension reduces taxable). */
  annualTaxable: number;
  /** Monthly pension deduction taken from gross (employee side). */
  pensionEmployeeMonthly: number;
  pensionEmployerMonthly: number;
  pensionSeveranceMonthly: number;
  /** Total monthly pension contribution (the three parties combined). */
  pensionTotalMonthly: number;
  /** Monthly study fund deduction (employee side). */
  studyFundEmployeeMonthly: number;
  studyFundEmployerMonthly: number;
  studyFundTotalMonthly: number;
  /** Income tax after credit points + periphery benefit. */
  incomeTaxMonthly: number;
  marginalBracket: number; // 0.10 … 0.50
  effectiveTaxRate: number; // tax / taxable income
  /** Bituach Leumi (national insurance) monthly. */
  bituachLeumiMonthly: number;
  /** Health tax monthly (מס בריאות) — 3.1% / 5%. */
  healthTaxMonthly: number;
  /** Total withholdings (what's NOT hitting your bank). */
  totalDeductionsMonthly: number;
  /** Take-home pay = gross − taxes − BL − health − pension(employee) − study-fund(employee). */
  netMonthly: number;
  /** Honest savings rate = (pension employee+employer+severance + study-fund employee+employer) / gross. */
  realSavingsRate: number;
  /** Tax loss when study fund is below the benefit cap. Signals "leave money on the table". */
  studyFundBenefitGap: number;
  /** Gross above the study-fund cap (where employer deposits become a taxable fringe). */
  studyFundExcessGross: number;
  /**
   * If the employer is depositing on the FULL gross (not just the cap), the
   * excess employer contribution becomes a taxable fringe benefit (זקיפת שווי).
   * This is the monthly tax on that excess — zero when gross ≤ cap. */
  studyFundFringeTaxMonthly: number;
  /**
   * Bituach Leumi + מס בריאות on the above-cap employer study fund contribution.
   * The excess is treated as salary for BL purposes, so the employee portion
   * (~12% combined NI+health above the low tier) applies on top of income tax. */
  studyFundBLTaxMonthly: number;
}

/* ═══════════════════════════════════════════════════════════
   Constants (2026 approximations)
   ═══════════════════════════════════════════════════════════ */

/** ₪ per credit point (annual) — 2026 post-CPI update. 1 point = ₪2,976/year ≈ ₪248/month. */
const CREDIT_POINT_ANNUAL = 2976;

/** Study fund benefit cap — above this monthly gross the employer contribution becomes taxable.
 *  Real 2025 value per רשות המסים (₪15,712). Update annually around January.
 *  Exported so UI copy references the constant dynamically instead of hard-coding a round number. */
export const STUDY_FUND_SALARY_CAP = 15712;

/**
 * Combined employee portion of Bituach Leumi + מס בריאות on salary above 60% of
 * the average wage (7% NI + 5% health ≈ 12%). Used to tax the above-cap
 * employer study-fund contribution as a fringe benefit — it is treated as
 * additional salary for BL purposes, not only income tax.
 */
export const STUDY_FUND_FRINGE_BL_RATE = 0.12;

/** Health tax (מס בריאות): 3.1% up to 60% of avg wage, 5% above. Applied on full gross. */
const AVG_WAGE_MONTHLY = AVG_WAGE_2026;
const HEALTH_TAX_LOW_RATE = 0.031;
const HEALTH_TAX_HIGH_RATE = 0.05;

/* ═══════════════════════════════════════════════════════════
   Main calculator
   ═══════════════════════════════════════════════════════════ */

export function computeSalaryBreakdown(profile: SalaryProfile): SalaryBreakdown {
  const gross = Math.max(0, Number(profile.monthlyGross) || 0);
  const bonus = Math.max(0, Number(profile.annualBonus) || 0);
  const annualGross = gross * 12 + bonus;

  // Pension (three-way contribution)
  const pE = gross * (profile.pensionEmployeePct / 100);
  const pR = gross * (profile.pensionEmployerPct / 100);
  const pS = gross * (profile.pensionSeverancePct / 100);
  const pensionTotal = pE + pR + pS;

  // Study fund (two-way). Capped at the benefit ceiling for tax purposes.
  const cappedGross = Math.min(gross, STUDY_FUND_SALARY_CAP);
  const sE = cappedGross * (profile.studyFundEmployeePct / 100);
  const sR = cappedGross * (profile.studyFundEmployerPct / 100);
  const studyFundTotal = sE + sR;

  // Taxable annual income = gross − employee pension contribution (not employer, not study fund up to cap).
  // This is a simplification; real tax law is more nuanced but accurate within a few percent.
  const annualTaxable = Math.max(0, annualGross - pE * 12);

  const rawTax = israeliIncomeTax(annualTaxable);
  const annualCredit = profile.creditPoints * CREDIT_POINT_ANNUAL;
  const peripheryRelief = Math.min(profile.peripheryBenefitPct / 100, 1) * rawTax.tax;
  const annualIncomeTax = Math.max(0, rawTax.tax - annualCredit - peripheryRelief);
  const incomeTaxMonthly = annualIncomeTax / 12;

  // Bituach Leumi (reuse existing helper; applied on monthly gross).
  const bl = bituachLeumiEstimate(gross);
  const bituachLeumiMonthly = bl.monthly;

  // Health tax — separate from BL in Israel; applied on gross with two-tier rate.
  const lowBase = Math.min(gross, AVG_WAGE_MONTHLY * 0.6);
  const highBase = Math.max(0, gross - AVG_WAGE_MONTHLY * 0.6);
  const healthTaxMonthly = lowBase * HEALTH_TAX_LOW_RATE + highBase * HEALTH_TAX_HIGH_RATE;

  const totalDeductionsMonthly =
    incomeTaxMonthly +
    bituachLeumiMonthly +
    healthTaxMonthly +
    pE + // employee pension
    sE; // employee study fund

  const netMonthly = Math.max(0, gross - totalDeductionsMonthly);

  const realSavingsRate = gross > 0 ? (pensionTotal + studyFundTotal) / gross : 0;

  // Benefit gap: how much more study fund you could contribute to hit the cap.
  const maxStudyFundAtCap = STUDY_FUND_SALARY_CAP * 0.025;
  const studyFundBenefitGap = Math.max(0, maxStudyFundAtCap - sE);

  // Above-cap fringe benefit: if the employer is depositing 7.5% on the FULL
  // gross (common in tech), the portion above the study-fund cap is taxable
  // to the employee (זקיפת שווי) at their marginal rate.
  const studyFundExcessGross = Math.max(0, gross - STUDY_FUND_SALARY_CAP);
  const employerExcessContrib = studyFundExcessGross * (profile.studyFundEmployerPct / 100);
  const studyFundFringeTaxMonthly = Math.round(employerExcessContrib * rawTax.marginalBracket);
  // Same excess is also subject to the employee portion of BL + מס בריאות
  // (~12% combined above the low tier). Only the portion that still fits
  // under the BL ceiling (5× avg wage) is chargeable — if gross already
  // exceeded the ceiling, the fringe is exempt from BL.
  const blCeiling = AVG_WAGE_MONTHLY * 5;
  const roomUnderBLCeiling = Math.max(0, blCeiling - gross);
  const fringeSubjectToBL = Math.min(employerExcessContrib, roomUnderBLCeiling);
  const studyFundBLTaxMonthly = Math.round(fringeSubjectToBL * STUDY_FUND_FRINGE_BL_RATE);

  return {
    monthlyGross: gross,
    annualGross,
    annualTaxable,
    pensionEmployeeMonthly: pE,
    pensionEmployerMonthly: pR,
    pensionSeveranceMonthly: pS,
    pensionTotalMonthly: pensionTotal,
    studyFundEmployeeMonthly: sE,
    studyFundEmployerMonthly: sR,
    studyFundTotalMonthly: studyFundTotal,
    incomeTaxMonthly,
    marginalBracket: rawTax.marginalBracket,
    effectiveTaxRate: annualTaxable > 0 ? annualIncomeTax / annualTaxable : 0,
    bituachLeumiMonthly,
    healthTaxMonthly,
    totalDeductionsMonthly,
    netMonthly,
    realSavingsRate,
    studyFundBenefitGap,
    studyFundExcessGross,
    studyFundFringeTaxMonthly,
    studyFundBLTaxMonthly,
  };
}

/* ═══════════════════════════════════════════════════════════
   Persistence
   ═══════════════════════════════════════════════════════════ */

export function loadSalaryProfile(): SalaryProfile {
  if (typeof window === "undefined") return { ...DEFAULT_SALARY_PROFILE };
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return { ...DEFAULT_SALARY_PROFILE };
    const parsed = JSON.parse(raw) as Partial<SalaryProfile>;
    return { ...DEFAULT_SALARY_PROFILE, ...parsed };
  } catch {
    return { ...DEFAULT_SALARY_PROFILE };
  }
}

export function saveSalaryProfile(profile: SalaryProfile): void {
  if (typeof window === "undefined") return;
  try {
    const toSave = { ...profile, savedAt: new Date().toISOString() };
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(toSave));
    window.dispatchEvent(new Event(SALARY_PROFILE_EVENT));
  } catch {}
}

/** True only after explicit user save (default profile returns false). */
export function hasSavedSalaryProfile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<SalaryProfile>;
    return !!parsed.savedAt && (Number(parsed.monthlyGross) || 0) > 0;
  } catch {
    return false;
  }
}
