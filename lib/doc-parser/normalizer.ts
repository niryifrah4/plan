/**
 * Supplier Normalizer + Internal Transfer Filter (Velora-grade)
 *
 * 1. Normalizes merchant names: "שופרסל דיל" & "שופרסל אקספרס" → "שופרסל"
 * 2. Detects internal transfers to prevent double-counting
 * 3. Assigns 3-tier expense hierarchy: essential / lifestyle / growth
 */

import type { ParsedTransaction } from "./types";

/* ─── Supplier Normalization Map ─── */
const SUPPLIER_GROUPS: [string, string[]][] = [
  // ── Supermarkets ──
  ["שופרסל", ["שופרסל דיל", "שופרסל אקספרס", "שופרסל אונליין", "שופרסל be", "שופרסל שלי"]],
  ["רמי לוי", ["רמי לוי שיווק", "רמי לוי online", "רמי לוי דיגיטל"]],
  ["יוחננוף", ["יוחננוף שיווק", "יוחננוף חסכון"]],
  ["ויקטורי", ["ויקטורי סופרמרקט", "victory"]],
  ["אושר עד", ["אושר עד סופר"]],
  // ── Pharmacy ──
  ["סופר פארם", ["סופר-פארם", "super pharm", "super-pharm", "סופרפארם"]],
  // ── Gas ──
  ["פז", ["פז דלק", "פז yellow", "yellow פז"]],
  ["סונול", ["סונול דלק", "סונול direct"]],
  ["דור אלון", ["דור-אלון", "דור אלון אנרגיה"]],
  // ── Cafes / restaurants ──
  ["ארומה", ["ארומה תל אביב", "ארומה tlv", "aroma espresso", "aroma il"]],
  ["קפה לנדוור", ["landwer", "לנדוור"]],
  ["מקדונלדס", ["mcdonald's", "mcdonalds", "mcdonald"]],
  // ── Streaming / tech ──
  ["נטפליקס", ["netflix", "netflix.com"]],
  ["ספוטיפיי", ["spotify", "spotify ab", "spotify premium"]],
  ["אפל", ["apple.com", "apple com bill", "itunes", "apple.com/bill"]],
  ["גוגל", ["google", "google storage", "google one", "google play"]],
  ["אמזון", ["amazon", "amazon prime", "amzn", "amazon.com"]],
  // ── Health funds ──
  ["מכבי", ["מכבי שירותי בריאות", "מכבי שר בריאות", "מכבי ש.ב"]],
  ["כללית", ["שירותי בריאות כללית", "כללית מוש", "כללית מושלם"]],
  // ── Insurance ──
  ["הפניקס", ["הפניקס חברה לביטוח", "הפניקס ביט"]],
  ["מגדל", ["מגדל ביטוח", "מגדל חברה לביטוח"]],
  ["הראל", ["הראל ביטוח", "הראל חברה לביטוח"]],
  ["מנורה", ["מנורה מבטחים", "מנורה ביט"]],
  ["איילון", ["איילון ביטוח", "איילון חברה"]],
  // ── Fashion ──
  ["זארה", ["zara", "zara.com"]],
  ["h&m", ["h & m", "hm.com"]],
  ["פוקס", ["fox", "fox home"]],
  // ── Utilities ──
  ["חברת חשמל", ["חב' חשמל", "iec", "israel electric", "חשמל ישראל"]],
  ["בזק", ["bezeq", "bezeq international", "בזק בינלאומי"]],
];

/**
 * Normalize a supplier/merchant name to its canonical form.
 */
export function normalizeSupplier(description: string): string {
  const lower = description.toLowerCase().replace(/[\u200F\u200E"]/g, "");
  for (const [canonical, variants] of SUPPLIER_GROUPS) {
    if (lower.includes(canonical.toLowerCase())) return canonical;
    for (const v of variants) {
      if (lower.includes(v.toLowerCase())) return canonical;
    }
  }
  return description; // return original if no match
}

/* ─── Internal Transfer Detection ─── */
const TRANSFER_PATTERNS = [
  /העברה\s*(בין|ל)?\s*חשבו(נות|ן)/i,
  /העב.ב\s*(בין)?/i,
  /transfer\s*(between|internal)/i,
  /בין\s*חשבו/i,
  /חשבון\s*ל?חשבון/i,
  /internal/i,
  /from\s*saving/i,
  /to\s*saving/i,
  /העברה\s*פנימית/i,
  /בית\s*לבית/i,
];

/**
 * Credit-card-payment-to-bank patterns (inspired by Spent's
 * CREDIT_CARD_PAYMENT_PATTERNS). When a charge for the user's own credit
 * card lands in their checking account, it's an internal transfer between
 * their own accounts — NOT an expense. Without these patterns we'd
 * double-count: once in the credit-card file, once in the bank file.
 *
 * The dedup engine catches some of this when both files are uploaded
 * together, but not when the user uploads them separately (different
 * sessions, slightly different descriptions, etc.).
 */
const CC_PAYMENT_PATTERNS = [
  // Hebrew credit card issuers — when these appear in a bank statement
  // description, the row is almost always the monthly card debit.
  /ישראכרט/i,
  /ויזה\s*כא[״"']?ל/i,
  /ויזה\s*לאומי/i,
  /ויזה\s*בינלאומי/i,
  /כא[״"']?ל\b/i,
  /לאומי\s*קארד/i,
  /אמריקן\s*אקספרס/i,
  /אמ[״"']?קס\b/i,
  /דיינרס/i,
  /מקס\s*איט/i,
  /\bmax\b/i,
  // Explicit "payment to credit company" phrasings
  /חיוב\s*אשראי/i,
  /תשלום\s*כרטיס/i,
  /סליקת\s*אשראי/i,
  // English
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /\bamex\b/i,
  /\bdiners\b/i,
  /credit\s*card\s*payment/i,
];

/**
 * Detect if a transaction is an internal transfer (should be excluded from cashflow).
 * Covers two flavors:
 *   1. Explicit transfers between own accounts (העברה בין חשבונות, Bit between people)
 *   2. Credit-card monthly debit landing in the checking account
 *      (those are also internal — the charge already counted on the card file)
 */
export function isInternalTransfer(description: string): boolean {
  const lower = description.toLowerCase().replace(/[\u200F\u200E"]/g, "");
  if (TRANSFER_PATTERNS.some((rx) => rx.test(lower))) return true;
  return CC_PAYMENT_PATTERNS.some((rx) => rx.test(lower));
}

/**
 * Filter out internal transfers from a transaction list.
 */
export function filterInternalTransfers(transactions: ParsedTransaction[]): {
  clean: ParsedTransaction[];
  removed: ParsedTransaction[];
} {
  const clean: ParsedTransaction[] = [];
  const removed: ParsedTransaction[] = [];

  for (const t of transactions) {
    if (isInternalTransfer(t.description)) {
      removed.push(t);
    } else {
      clean.push(t);
    }
  }

  return { clean, removed };
}

/* ─── 3-Tier Expense Hierarchy (Velora-style) ─── */
export type ExpenseTier = "essential" | "lifestyle" | "growth";

export interface TierInfo {
  tier: ExpenseTier;
  label: string;
  icon: string;
  color: string;
}

const TIER_MAP: Record<string, ExpenseTier> = {
  housing: "essential",
  food: "essential",
  health: "essential",
  utilities: "essential",
  insurance: "essential",
  education: "essential",
  transport: "essential",
  fees: "essential", // bank fees are essential overhead
  leisure: "lifestyle",
  dining_out: "lifestyle", // dining out & entertainment
  shopping: "lifestyle",
  subscriptions: "lifestyle",
  cash: "lifestyle",
  pension: "growth",
  salary: "growth", // income, not expense
  refunds: "lifestyle", // credit refunds — offsets expenses
  transfers: "lifestyle",
  other: "lifestyle",
};

export const TIER_INFO: Record<ExpenseTier, TierInfo> = {
  essential: { tier: "essential", label: "הכרחיות", icon: "verified", color: "#1B4332" },
  lifestyle: { tier: "lifestyle", label: "איכות חיים", icon: "spa", color: "#f59e0b" },
  growth: { tier: "growth", label: "צמיחה וחיסכון", icon: "trending_up", color: "#3b82f6" },
};

export function getTier(categoryKey: string): ExpenseTier {
  return TIER_MAP[categoryKey] || "lifestyle";
}

/**
 * Group transactions by tier.
 */
export function groupByTier(
  transactions: ParsedTransaction[]
): Record<ExpenseTier, { total: number; count: number }> {
  const result: Record<ExpenseTier, { total: number; count: number }> = {
    essential: { total: 0, count: 0 },
    lifestyle: { total: 0, count: 0 },
    growth: { total: 0, count: 0 },
  };

  for (const t of transactions) {
    if (t.amount <= 0) continue; // skip income
    const tier = getTier(t.category);
    result[tier].total += t.amount;
    result[tier].count++;
  }

  return result;
}
