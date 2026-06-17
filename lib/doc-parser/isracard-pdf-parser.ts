/**
 * Isracard monthly statement parser.
 *
 * pdf-parse extracts the compact Isracard table as one row per transaction:
 *   "220259506₪215.00₪215.00רכישות שובר באתר המו21.04.26"
 *
 * Columns are voucher, charge amount, transaction amount, merchant, purchase date.
 */

import { categorize } from "./categorizer";
import { cleanAmount, parseILDate } from "./number-utils";
import type { ParsedTransaction } from "./types";

const DATE_END = /(\d{1,2}\.\d{1,2}\.\d{2,4})\s*$/;
const SHEKEL_AMOUNT = /₪\s*-?[\d,]+(?:\.\d{2})?/g;

function normalizeDescription(description: string): string {
  return description
    .replace(/[\u200E\u200F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIsracardRow(line: string): ParsedTransaction | null {
  const dateMatch = line.match(DATE_END);
  if (!dateMatch) return null;

  const date = parseILDate(dateMatch[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const beforeDate = line.slice(0, dateMatch.index).trim();
  const amountMatches = [...beforeDate.matchAll(SHEKEL_AMOUNT)];
  if (amountMatches.length < 2) return null;

  const chargeMatch = amountMatches[amountMatches.length - 2];
  const transactionMatch = amountMatches[amountMatches.length - 1];
  const chargeAmount = cleanAmount(chargeMatch[0]);
  if (chargeAmount === 0) return null;

  const merchantStart = (transactionMatch.index ?? 0) + transactionMatch[0].length;
  const description = normalizeDescription(beforeDate.slice(merchantStart));
  if (!description) return null;

  const isCredit = /זיכוי|החזר/.test(line) || chargeAmount < 0;
  const cat = categorize(description);

  return {
    date,
    description,
    amount: isCredit ? -Math.abs(chargeAmount) : Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw: line,
  };
}

export function looksLikeIsracardStatement(text: string): boolean {
  return /ישראכרט|מסטרקארד|Mastercard|גולד\s*-\s*מסטרקארד/.test(text) && /עסקאות למועד חיוב/.test(text);
}

export function parseIsracardTransactions(lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let inTransactionsTable = false;

  for (const line of lines) {
    if (/עסקאות למועד חיוב/.test(line)) {
      inTransactionsTable = true;
      continue;
    }
    if (/סה["״']?כ לחיוב החודש בכרטיס|תנאים משפטיים|משפטייםתנאים/.test(line)) {
      inTransactionsTable = false;
      continue;
    }
    if (!inTransactionsTable) continue;

    const tx = parseIsracardRow(line);
    if (tx) transactions.push(tx);
  }

  return transactions;
}
