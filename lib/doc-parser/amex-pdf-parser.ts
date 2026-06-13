/**
 * American Express Israel monthly statement parser.
 *
 * pdf-parse extracts local rows as:
 *   "01/07/25 לא הוצג רכישות שובר באתר המו שיווק ישיר 120.00 120.00"
 *
 * Columns are: date, card-present flag, sector, merchant, transaction amount,
 * charge amount. The charge amount is the value imported into cashflow.
 */

import { categorize } from "./categorizer";
import { cleanAmount, parseILDate } from "./number-utils";
import type { ParsedTransaction } from "./types";

const DATE_PREFIX = /^(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\s+(.+)$/;
const AMOUNT = /-?[\d,]+\.\d{2}/g;
const PRESENTATION_PREFIX = /^(?:לא הוצג|הוצג)\s+/;
const AMEX_SECTORS = [
  "שיווק ישיר",
  "בתי כלבו",
  "מסעדות",
  "תיירות",
  "תחבורה",
  "רכישות",
  "שירותים",
  "תקשורת",
  "ביטוח",
  "בריאות",
  "אופנה",
  "מזון",
  "דלק",
].sort((a, b) => b.length - a.length);

function normalizeDescription(description: string): string {
  return description.replace(/[\u200F\u200E]/g, "").replace(/\s+/g, " ").trim();
}

function extractAmounts(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map((match) => cleanAmount(match[0]));
}

function stripPresentationAndSector(rest: string): string {
  let chunk = rest.replace(PRESENTATION_PREFIX, "").trim();

  for (const sector of AMEX_SECTORS) {
    if (chunk.startsWith(`${sector} `)) return chunk.slice(sector.length).trim();
  }

  return chunk;
}

function parseAmexRow(line: string): ParsedTransaction | null {
  const match = line.match(DATE_PREFIX);
  if (!match) return null;

  const date = parseILDate(match[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const rest = match[2];
  const amounts = extractAmounts(rest);
  if (amounts.length < 2) return null;

  const firstAmountIndex = rest.search(AMOUNT);
  if (firstAmountIndex <= 0) return null;

  const description = normalizeDescription(stripPresentationAndSector(rest.slice(0, firstAmountIndex)));
  if (!description) return null;

  const chargeAmount = amounts[amounts.length - 1];
  if (chargeAmount === 0) return null;

  const isCredit = /זוכו|זיכוי|החזר/.test(line);
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

export function looksLikeAmexStatement(text: string): boolean {
  return /אמריקן אקספרס/.test(text) && /עסקות שחויבו \/ זוכו/.test(text);
}

export function parseAmexTransactions(lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let inTransactionsTable = false;

  for (const line of lines) {
    if (/עסקות שחויבו \/ זוכו/.test(line)) {
      inTransactionsTable = true;
      continue;
    }
    if (/סה"כ חיוב לתאריך|מסגרת הכרטיס|עמוד \d+ מתוך/.test(line)) {
      inTransactionsTable = false;
      continue;
    }
    if (!inTransactionsTable) continue;

    const tx = parseAmexRow(line);
    if (tx) transactions.push(tx);
  }

  return transactions;
}
