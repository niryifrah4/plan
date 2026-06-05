/**
 * Shared static data for the onboarding questionnaire — dropdown options,
 * default row sets, and the helper formatters used across steps.
 */

import type { IncomeRow, InsRow, Child } from "./types";
import { fmtILS } from "@/lib/format";

/** Income rows shown by default to every new client; the user can edit/delete.
 *  "שכר" and "הכנסה מנכסים מניבים" are also covered automatically by the
 *  salary profile and the real-estate store; values entered here are still
 *  used in the snapshot but won't double-inject into the budget. The
 *  allowance rows (קצבאות) feed straight into the budget as income. */
export const INCOME_DEFAULTS: IncomeRow[] = [
  { label: "שכר בן/בת זוג 1 (נטו)", value: "" },
  { label: "שכר בן/בת זוג 2 (נטו)", value: "" },
  { label: "הכנסה מנכסים מניבים", value: "" },
  { label: "קצבת ילדים", value: "" },
  { label: "קצבת נכות / אחר מביטוח לאומי", value: "" },
  { label: "עזרה מההורים", value: "" },
];

export const ASSET_TYPES = [
  'נדל"ן למגורים',
  'נדל"ן להשקעה',
  "רכב",
  "רכב יוקרה",
  "תיק השקעות",
  "פיקדון / חיסכון",
  "קופת גמל",
  "קרן השתלמות",
  "אחר",
];

export const LIAB_TYPES = [
  "משכנתא",
  "הלוואה בנקאית",
  "הלוואה חוץ-בנקאית",
  "מסגרת אוברדרפט",
  "אחר",
];

export const FRAMEWORKS = ["גן", "יסודי", 'חט"ב', "תיכון", "אחרי צבא", "בוגר"];

export const INS_DEFAULTS: InsRow[] = [
  { type: "ביטוח חיים", has: "", company: "", coverage: "", premium: "" },
  { type: "בריאות", has: "", company: "", coverage: "", premium: "" },
  { type: "סיעוד", has: "", company: "", coverage: "", premium: "" },
  { type: "אובדן כושר עבודה", has: "", company: "", coverage: "", premium: "" },
];

export const EMPTY_CHILD: Child = {
  name: "",
  dob: "",
  gender: "",
  age: "",
  framework: "",
  special: "",
  savings_provider: "",
  savings_track: "medium",
  savings_balance: "",
  savings_parent_deposit: "57",
};

export const STEP_LABELS = [
  "פרופיל משפחתי",
  "תמונה כספית",
  "סיכונים ומשפט",
  "חזון ויעדים",
  "פנסיה ופרישה",
];

export const TOTAL_STEPS = STEP_LABELS.length;

/** Loose number coercion used across the form. Empty strings become 0. */
export const n = (v: string | undefined | null): number => Number(v) || 0;

/** ILS formatter for footer sums (rounded to nearest shekel, RTL-safe). */
export const fmt = (v: number): string => fmtILS(v);
