/**
 * ═══════════════════════════════════════════════════════════
 *  Cashflow Breakdown — fixed/variable × personal/business
 * ═══════════════════════════════════════════════════════════
 *
 * Takes the mapped-and-saved ParsedTransaction[] and classifies every line
 * into a 2×2 matrix the advisor needs:
 *
 *                    PERSONAL          BUSINESS
 *                   ┌──────────────────────────────────┐
 *           FIXED   │  housing, utils, ins, pension    │ tax, Stripe fees
 *                   │                                  │
 *        VARIABLE   │  food, transport, leisure, ...  │ ads, freelance, …
 *                   └──────────────────────────────────┘
 *
 * Fixed vs variable comes from the category — the bucket of each is fixed
 * by accounting convention (`CATEGORY_BUCKET` below). Personal vs business
 * comes from the per-transaction `scope` flag (set in DocumentsTab and the
 * unmapped queue), with a sensible default for inherently-business
 * categories (advertising, business taxes, payment processing).
 *
 * Used by the /balance "מבט מאוחד" view to give Nir's עצמאי clients a
 * clean separation between עסק and חיים, which is what he asked for after
 * the mapping refactor: "המטרה שלי לייצר הפרדה בין ההוצאות העסקיות
 * להוצאות של החיים עצמם".
 */

import type { ParsedTransaction } from "./doc-parser/types";

export type CashflowBucket = "fixed" | "variable";
export type CashflowScope = "personal" | "business";

/**
 * Category → bucket map. Conservative defaults: when in doubt, classify as
 * variable so the fixed bucket stays a tight floor estimate.
 *
 * Pension is "fixed" because the monthly contribution is contractual.
 * Salary is income but lives in the same map — it's "fixed" so the income
 * stream is recognized as predictable when computing the saving rate.
 */
const CATEGORY_BUCKET: Record<string, CashflowBucket> = {
  // Personal fixed
  housing: "fixed",
  utilities: "fixed",
  insurance: "fixed",
  education: "fixed",
  pension: "fixed",
  fees: "fixed",
  subscriptions: "fixed",
  // Personal variable
  food: "variable",
  transport: "variable",
  dining_out: "variable",
  shopping: "variable",
  leisure: "variable",
  health: "variable",
  cash: "variable",
  home_maintenance: "variable",
  refunds: "variable",
  // Business
  business_taxes: "fixed", // monthly מקדמת מס + מע"מ
  business_payments: "fixed", // monthly Stripe/Cardcom subscription fees
  professional_services: "variable", // ad-hoc accountant, lawyer
  advertising_marketing: "variable", // campaign-dependent
  // Neutral / income
  salary: "fixed",
  transfers: "variable",
  misc: "variable",
  other: "variable",
};

/**
 * Categories that are inherently business — when scope is unset on the
 * transaction, we default them to business rather than personal.
 */
const INHERENT_BUSINESS = new Set([
  "advertising_marketing",
  "professional_services",
  "business_taxes",
  "business_payments",
]);

export function bucketOf(categoryKey: string): CashflowBucket {
  return CATEGORY_BUCKET[categoryKey] || "variable";
}

export function scopeOf(tx: ParsedTransaction): CashflowScope {
  if (tx.scope === "business") return "business";
  if (tx.scope === "personal") return "personal";
  // No explicit scope — fall back to inherent-business default.
  return INHERENT_BUSINESS.has(tx.category) ? "business" : "personal";
}

/**
 * Detailed breakdown of a single bucket (e.g. "fixed personal").
 * `items` are grouped by category for the UI to render category rows.
 */
export interface BucketBreakdown {
  bucket: CashflowBucket;
  scope: CashflowScope;
  /** ₪ total — expenses are positive, income is negative. */
  total: number;
  /** Pure expense total (positive only). */
  expenseTotal: number;
  /** Pure income total (negative-amount magnitude). */
  incomeTotal: number;
  /** Count of transactions in the bucket. */
  txCount: number;
  /** Per-category rollup, sorted by amount descending. */
  categories: Array<{
    key: string;
    label: string;
    amount: number; // positive = expense
    count: number;
  }>;
}

export interface CashflowBreakdown {
  /** Months covered by the input — used to compute monthly averages. */
  monthsCovered: number;
  /** First date in the input (yyyy-mm-dd). */
  periodFrom: string;
  /** Last date in the input (yyyy-mm-dd). */
  periodTo: string;
  /** Bucket totals — the 2×2 matrix. */
  buckets: {
    fixedPersonal: BucketBreakdown;
    fixedBusiness: BucketBreakdown;
    variablePersonal: BucketBreakdown;
    variableBusiness: BucketBreakdown;
  };
  /** Aggregated income across personal + business (negative amount magnitudes). */
  totalIncome: number;
  /** Aggregated expense across all 4 buckets. */
  totalExpense: number;
  /** income − expense, per month (averaged across `monthsCovered`). */
  monthlyNet: number;
  /** Avg monthly burn (expense only). */
  monthlyBurn: number;
  /** 0..1 — saving rate (income − expense) / income. */
  savingRate: number;
}

function emptyBucket(bucket: CashflowBucket, scope: CashflowScope): BucketBreakdown {
  return {
    bucket,
    scope,
    total: 0,
    expenseTotal: 0,
    incomeTotal: 0,
    txCount: 0,
    categories: [],
  };
}

function countMonths(periodFrom: string, periodTo: string): number {
  if (!periodFrom || !periodTo) return 1;
  const [fy, fm] = periodFrom.split("-").map(Number);
  const [ty, tm] = periodTo.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 1;
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  return Math.max(1, months);
}

/**
 * Run the full breakdown. Returns the empty shape when there are no
 * transactions so the UI can render "no data yet" without special-casing.
 */
export function buildCashflowBreakdown(transactions: ParsedTransaction[]): CashflowBreakdown {
  const empty = (): CashflowBreakdown => ({
    monthsCovered: 1,
    periodFrom: "",
    periodTo: "",
    buckets: {
      fixedPersonal: emptyBucket("fixed", "personal"),
      fixedBusiness: emptyBucket("fixed", "business"),
      variablePersonal: emptyBucket("variable", "personal"),
      variableBusiness: emptyBucket("variable", "business"),
    },
    totalIncome: 0,
    totalExpense: 0,
    monthlyNet: 0,
    monthlyBurn: 0,
    savingRate: 0,
  });

  if (!transactions.length) return empty();

  /* ── Date range + month count ── */
  const dates = transactions
    .map((t) => t.date)
    .filter((d): d is string => !!d)
    .sort();
  const periodFrom = dates[0] || "";
  const periodTo = dates[dates.length - 1] || "";
  const monthsCovered = countMonths(periodFrom, periodTo);

  /* ── Bucket per tx + per-category rollup inside each bucket ── */
  type CatAcc = Map<string, { label: string; amount: number; count: number }>;
  const accs: Record<string, { bucket: BucketBreakdown; cats: CatAcc }> = {
    fixedPersonal: { bucket: emptyBucket("fixed", "personal"), cats: new Map() },
    fixedBusiness: { bucket: emptyBucket("fixed", "business"), cats: new Map() },
    variablePersonal: { bucket: emptyBucket("variable", "personal"), cats: new Map() },
    variableBusiness: { bucket: emptyBucket("variable", "business"), cats: new Map() },
  };
  const accKey = (b: CashflowBucket, s: CashflowScope): keyof typeof accs => {
    if (b === "fixed" && s === "personal") return "fixedPersonal";
    if (b === "fixed" && s === "business") return "fixedBusiness";
    if (b === "variable" && s === "personal") return "variablePersonal";
    return "variableBusiness";
  };

  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of transactions) {
    const b = bucketOf(t.category);
    const s = scopeOf(t);
    const slot = accs[accKey(b, s)];
    const amt = t.amount;

    slot.bucket.total += amt;
    slot.bucket.txCount += 1;
    if (amt > 0) {
      slot.bucket.expenseTotal += amt;
      totalExpense += amt;
    } else if (amt < 0) {
      slot.bucket.incomeTotal += Math.abs(amt);
      totalIncome += Math.abs(amt);
    }

    const prev = slot.cats.get(t.category) || { label: t.categoryLabel || t.category, amount: 0, count: 0 };
    prev.amount += amt;
    prev.count += 1;
    slot.cats.set(t.category, prev);
  }

  // Materialize categories as sorted arrays
  for (const slot of Object.values(accs)) {
    slot.bucket.categories = Array.from(slot.cats.entries())
      .map(([key, v]) => ({ key, label: v.label, amount: v.amount, count: v.count }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }

  const monthlyNet = (totalIncome - totalExpense) / monthsCovered;
  const monthlyBurn = totalExpense / monthsCovered;
  const savingRate = totalIncome > 0 ? Math.max(0, (totalIncome - totalExpense) / totalIncome) : 0;

  return {
    monthsCovered,
    periodFrom,
    periodTo,
    buckets: {
      fixedPersonal: accs.fixedPersonal.bucket,
      fixedBusiness: accs.fixedBusiness.bucket,
      variablePersonal: accs.variablePersonal.bucket,
      variableBusiness: accs.variableBusiness.bucket,
    },
    totalIncome,
    totalExpense,
    monthlyNet,
    monthlyBurn,
    savingRate,
  };
}
