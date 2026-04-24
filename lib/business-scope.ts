/**
 * Business Scope Gate
 *
 * Determines whether the business/personal separation UI should be shown
 * based on employment type from onboarding (auto) or a manual override
 * from Settings (escape hatch).
 *
 * Logic:
 *   1. If there's a manual override (verdant:business_scope_override) — use it.
 *   2. Else derive from onboarding fields p1_emp_type / p2_emp_type:
 *      - Any partner is "self_employed" or "mixed" → enabled.
 *      - Both are "employee" or empty → disabled.
 *   3. Default (no onboarding, no override) → disabled.
 */

import { scopedKey } from "./client-scope";

const OVERRIDE_KEY = "verdant:business_scope_override";
const ONBOARDING_KEY = "verdant:onboarding:fields";

/** Fired when the business scope flag changes. */
export const BUSINESS_SCOPE_EVENT = "verdant:business_scope:changed";

export type EmploymentType = "employee" | "self_employed" | "mixed";

/** Check whether business scope UI should be shown. */
export function isBusinessScopeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // 1. Manual override takes priority
    const override = localStorage.getItem(scopedKey(OVERRIDE_KEY));
    if (override === "true") return true;
    if (override === "false") return false;

    // 2. Derive from onboarding employment type
    //    Onboarding stores Hebrew labels; map them to a boolean.
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (raw) {
      const fields = JSON.parse(raw) as Record<string, string>;
      const isSelfOrMixed = (v?: string) =>
        v === "עצמאי/ת" || v === "שכיר/ה + עצמאי/ת"
        || v === "self_employed" || v === "mixed";
      if (isSelfOrMixed(fields.p1_emp_type) || isSelfOrMixed(fields.p2_emp_type)) {
        return true;
      }
    }
  } catch {}
  return false;
}

/** Set manual override (true = show, false = hide, null = clear override → use auto). */
export function setBusinessScopeOverride(value: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = scopedKey(OVERRIDE_KEY);
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(value));
    }
    window.dispatchEvent(new CustomEvent(BUSINESS_SCOPE_EVENT));
  } catch {}
}

/** Get current manual override state (null = auto/unset). */
export function getBusinessScopeOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(scopedKey(OVERRIDE_KEY));
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {}
  return null;
}

/** Fire the change event — call after onboarding fields are saved. */
export function notifyBusinessScopeChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BUSINESS_SCOPE_EVENT));
}
