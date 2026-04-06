/**
 * 4-Bucket Expense Logic (CFP Standard)
 *
 * Every transaction is classified into one of 5 buckets:
 *   fixed      — שכירות, ארנונה, ביטוחים, תקשורת, חשמל, מים
 *   variable   — מזון, פנאי, קניות, דלק, בריאות
 *   installments — תשלומים, עסקאות תשלומים
 *   loans      — הלוואות, משכנתא, החזר הלוואה
 *   unmapped   — לא מופו, אחר
 */

export type Bucket = "fixed" | "variable" | "installments" | "loans" | "unmapped";

export interface BucketInfo {
  key: Bucket;
  label: string;
  icon: string;
  color: string;
  bgLight: string;
}

export const BUCKET_META: Record<Bucket, BucketInfo> = {
  fixed:        { key: "fixed",        label: "הוצאות קבועות",   icon: "lock",           color: "#0a7a4a", bgLight: "#eef7f1" },
  variable:     { key: "variable",     label: "הוצאות משתנות",   icon: "shuffle",        color: "#f59e0b", bgLight: "#fffbeb" },
  installments: { key: "installments", label: "תשלומים",         icon: "credit_score",   color: "#3b82f6", bgLight: "#eff6ff" },
  loans:        { key: "loans",        label: "הלוואות",         icon: "account_balance", color: "#b91c1c", bgLight: "#fef2f2" },
  unmapped:     { key: "unmapped",     label: "לא מופו",         icon: "help_outline",   color: "#94a3b8", bgLight: "#f8fafc" },
};

/** Map category key → bucket */
const CAT_TO_BUCKET: Record<string, Bucket> = {
  // Fixed
  housing:       "fixed",
  utilities:     "fixed",
  insurance:     "fixed",
  education:     "fixed",
  subscriptions: "fixed",

  // Variable
  food:          "variable",
  transport:     "variable",
  health:        "variable",
  leisure:       "variable",
  shopping:      "variable",
  cash:          "variable",

  // Loans
  pension:       "fixed",     // pension deductions are fixed
  salary:        "variable",  // income, treated as variable context

  // Refunds — variable (offsets expenses)
  refunds:       "variable",

  // Transfers — unmapped by default
  transfers:     "unmapped",
  other:         "unmapped",
};

/** Get the bucket for a given category key. */
export function getBucket(categoryKey: string): Bucket {
  return CAT_TO_BUCKET[categoryKey] || "unmapped";
}

/** Detect installments from description patterns. */
const INSTALLMENT_PATTERNS = [
  /תשלום\s*\d+\s*מתוך\s*\d+/i,
  /\d+\/\d+\s*תשלומים/i,
  /תש(לום|\.)\s*\d/i,
  /installment/i,
  /תשלומים/i,
];

/** Detect loan patterns. */
const LOAN_PATTERNS = [
  /הלוואה/i,
  /החזר\s*הלוואה/i,
  /loan/i,
  /משכנתא/i,
];

/**
 * Smart bucket assignment — checks description patterns first, then category mapping.
 */
export function assignBucket(categoryKey: string, description: string): Bucket {
  const lower = description.toLowerCase().replace(/[\u200F\u200E"]/g, "");

  // Pattern-based overrides (highest priority)
  if (LOAN_PATTERNS.some(rx => rx.test(lower))) return "loans";
  if (INSTALLMENT_PATTERNS.some(rx => rx.test(lower))) return "installments";

  return CAT_TO_BUCKET[categoryKey] || "unmapped";
}

/** Bucket order for display. */
export const BUCKET_ORDER: Bucket[] = ["fixed", "variable", "installments", "loans", "unmapped"];
