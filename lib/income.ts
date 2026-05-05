/**
 * Income Helpers — single source of truth for household monthly NET income.
 *
 * Why this file exists: gross vs. net was scattered across the codebase —
 * ONB_INCOMES holds net values (per onboarding labels: "שכר ... (נטו)"),
 * assumptions.monthlyIncome was typed as gross, and SalaryProfile is gross.
 * That mix produced wrong numbers in the emergency-fund target and the
 * 12-month cashflow forecast.
 *
 * Resolution priority:
 *   1. ONB_INCOMES sum   — explicit user-entered net values from onboarding
 *   2. SalaryProfile     — computed gross→net via the salary engine
 *   3. 0                 — no data yet
 *
 * Per Nir 2026-05-05: the family lives off NET, so every calculation that
 * targets "what the family can spend / save" must use net.
 */

import { scopedKey } from "./client-scope";
import { loadSalaryProfile, computeSalaryBreakdown, hasSavedSalaryProfile } from "./salary-engine";

const ONB_INCOMES_KEY = "verdant:onboarding:incomes";

/** Sum of all rows in ONB_INCOMES (net values per onboarding labels). */
function readOnboardingIncomesSum(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(scopedKey(ONB_INCOMES_KEY));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Array<{ value?: string }>;
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((s, r) => s + (parseFloat(r?.value || "0") || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Household monthly NET income.
 * Returns 0 if the user hasn't entered anything yet — callers should treat
 * 0 as "we don't know" and decline to compute downstream estimates.
 */
export function getMonthlyNetIncome(): number {
  const fromOnboarding = readOnboardingIncomesSum();
  if (fromOnboarding > 0) return Math.round(fromOnboarding);

  // Fallback: compute net from a saved gross salary profile (single-earner case).
  if (hasSavedSalaryProfile()) {
    const profile = loadSalaryProfile();
    const breakdown = computeSalaryBreakdown(profile);
    return Math.round(breakdown.netMonthly);
  }

  return 0;
}
