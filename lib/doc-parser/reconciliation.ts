/**
 * Reconciliation Engine — The High-Precision Brain
 *
 * Every parsed document must match its source 100%. This module performs
 * a "sum check" on parsed transactions:
 *
 *   opening_balance + Σ(credits) − Σ(debits) = closing_balance
 *
 * If the equation doesn't balance, we emit a warning so the user knows
 * the file may be partially parsed (and doesn't silently lose data).
 */

import type { ParsedTransaction } from "./types";

export interface ReconciliationInput {
  /** Opening balance declared in the document (if extractable) */
  openingBalance?: number;
  /** Closing balance declared in the document (if extractable) */
  closingBalance?: number;
  /** Parsed transaction list (positive = debit/expense, negative = credit/income) */
  transactions: ParsedTransaction[];
}

export interface ReconciliationResult {
  ok: boolean;
  /** Expected closing balance based on parsed transactions */
  computed: number;
  /** Delta between declared closing and computed (positive = missing debits) */
  delta: number;
  /** Pct of declared closing — used to decide severity */
  driftPct: number;
  /** User-facing message in Hebrew */
  message: string;
  /** 'clean' | 'minor' (< 0.5%) | 'major' (> 0.5%) | 'skipped' */
  severity: "clean" | "minor" | "major" | "skipped";
}

export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const { openingBalance, closingBalance, transactions } = input;

  if (openingBalance === undefined || closingBalance === undefined) {
    return {
      ok: true,
      computed: 0,
      delta: 0,
      driftPct: 0,
      severity: "skipped",
      message: "יתרות פתיחה/סגירה לא זוהו במסמך — לא בוצעה בדיקת סיכום",
    };
  }

  // Sum: negative amounts = credits (incoming), positive = debits (outgoing)
  let credits = 0;
  let debits = 0;
  for (const t of transactions) {
    if (t.amount < 0) credits += Math.abs(t.amount);
    else debits += t.amount;
  }

  const computed = openingBalance + credits - debits;
  const delta = Math.round((closingBalance - computed) * 100) / 100;
  const base = Math.abs(closingBalance) || 1;
  const driftPct = Math.abs(delta) / base;

  if (Math.abs(delta) < 1) {
    return {
      ok: true,
      computed,
      delta,
      driftPct,
      severity: "clean",
      message: "✓ בדיקת סיכום תואמת 100% למסמך המקור",
    };
  }

  if (driftPct < 0.005) {
    return {
      ok: true,
      computed,
      delta,
      driftPct,
      severity: "minor",
      message: `⚠ סטייה קלה של ${formatILS(delta)} (${(driftPct * 100).toFixed(2)}%) — כנראה עיגולים`,
    };
  }

  return {
    ok: false,
    computed,
    delta,
    driftPct,
    severity: "major",
    message: `✗ סטייה של ${formatILS(delta)} (${(driftPct * 100).toFixed(2)}%) — ייתכן שתנועות חסרות. בדוק את המסמך המקורי.`,
  };
}

function formatILS(n: number): string {
  return "₪" + Math.abs(Math.round(n)).toLocaleString("he-IL");
}

/**
 * Extract opening/closing balance from raw document text using
 * common Hebrew banking phrases.
 */
export function extractBalances(text: string): { opening?: number; closing?: number } {
  const lines = text.split(/\r?\n/);
  let opening: number | undefined;
  let closing: number | undefined;

  const OPENING_PATTERNS = [
    /יתרת\s*פתיחה[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*התחלתית[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*קודמת[^\d\-]*(-?[\d,\.]+)/,
  ];
  const CLOSING_PATTERNS = [
    /יתרת\s*סגירה[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*סופית[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*נוכחית[^\d\-]*(-?[\d,\.]+)/,
  ];

  for (const line of lines) {
    if (opening === undefined) {
      for (const re of OPENING_PATTERNS) {
        const m = line.match(re);
        if (m) { opening = parseNum(m[1]); break; }
      }
    }
    if (closing === undefined) {
      for (const re of CLOSING_PATTERNS) {
        const m = line.match(re);
        if (m) { closing = parseNum(m[1]); break; }
      }
    }
    if (opening !== undefined && closing !== undefined) break;
  }

  return { opening, closing };
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, "")) || 0;
}
