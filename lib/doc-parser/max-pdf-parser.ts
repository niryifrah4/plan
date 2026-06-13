/**
 * MAX monthly statement parser.
 *
 * pdf-parse extracts MAX rows in a mostly readable order:
 *   "18/01/257SPEEDתשלומים2,388.00199.00תשלום 7 מתוך 12"
 *   "07/07/257PATE AND PUFFרגילה92.0092.00"
 *
 * The extra digit after the date appears in some rows before the merchant.
 */

import { categorize } from "./categorizer";
import { cleanAmount, parseILDate } from "./number-utils";
import type { ParsedTransaction } from "./types";

const DATE_PREFIX = /^(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))(.*)$/;
const AMOUNT = /-?[\d,]+\.\d{2}\s*(?:₪|ILS)?/g;
const LOCAL_TYPES = ["תשלומים", "רגילה", "זיכוי", "קרדיט", "דחוי"].sort(
  (a, b) => b.length - a.length
);

function stripMaxDateSuffix(rest: string): string {
  const cleaned = rest.trim();
  // MAX sometimes emits a single card/control digit directly after the date.
  if (/^\d(?=[A-Za-z\u0590-\u05FF])/.test(cleaned)) return cleaned.slice(1).trim();
  if (/^\d\s+(?=[A-Za-z\u0590-\u05FF])/.test(cleaned)) return cleaned.slice(1).trim();
  return cleaned;
}

function normalizeDescription(description: string): string {
  return description.replace(/[\u200F\u200E]/g, "").replace(/\s+/g, " ").trim();
}

function extractAmounts(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map((match) => cleanAmount(match[0]));
}

function parseLocalRow(date: string, rest: string, raw: string): ParsedTransaction | null {
  let type = "";
  let typeIndex = -1;

  for (const candidate of LOCAL_TYPES) {
    const idx = rest.indexOf(candidate);
    if (idx === -1) continue;
    if (typeIndex === -1 || idx < typeIndex) {
      typeIndex = idx;
      type = candidate;
    }
  }

  if (typeIndex <= 0) return null;

  const description = normalizeDescription(rest.slice(0, typeIndex));
  const tail = rest.slice(typeIndex + type.length);
  const amounts = extractAmounts(tail);
  if (!description || amounts.length === 0) return null;

  // In MAX local rows the second amount is "סכום החיוב"; the first is
  // "סכום העסקה". For ordinary ILS rows they are often identical.
  const chargeAmount = amounts.length >= 2 ? amounts[1] : amounts[0];
  if (chargeAmount === 0) return null;

  const isCredit = type === "זיכוי" || /זיכוי|החזר/.test(raw);
  const cat = categorize(description);
  return {
    date,
    description,
    amount: isCredit ? -Math.abs(chargeAmount) : Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw,
  };
}

function parseForeignRow(date: string, rest: string, raw: string): ParsedTransaction | null {
  const amounts = extractAmounts(rest);
  if (amounts.length < 2) return null;

  const firstAmount = rest.search(AMOUNT);
  if (firstAmount <= 0) return null;

  const description = normalizeDescription(rest.slice(0, firstAmount));
  if (!description) return null;

  const chargeAmount = amounts[amounts.length - 1];
  if (chargeAmount === 0) return null;

  const cat = categorize(description);
  return {
    date,
    description,
    amount: Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw,
  };
}

function extractTransferRecipient(line: string): string {
  const match = line.match(/^הועבר ל:\s*(.+?)\.?$/);
  return normalizeDescription(match?.[1] ?? "");
}

function canAttachTransferRecipient(tx: ParsedTransaction | undefined): tx is ParsedTransaction {
  if (!tx) return false;
  return /BIT|PAYBOX|העברה ב/i.test(tx.description);
}

export function looksLikeMaxStatement(text: string): boolean {
  return /פירוט החיובים בחשבון/.test(text) && /\bmax\b|MAX|עסקות בארץ \/ בש"ח/.test(text);
}

export function parseMaxTransactions(lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let inLocalTable = false;
  let inForeignTable = false;

  for (const line of lines) {
    if (/עסקות בחו"ל \/ במטבע זר/.test(line)) {
      inForeignTable = true;
      inLocalTable = false;
      continue;
    }
    if (/עסקות בארץ \/ בש"ח/.test(line)) {
      inLocalTable = true;
      inForeignTable = false;
      continue;
    }
    if (/סה"כ חיובים בתאריך/.test(line)) {
      inLocalTable = false;
      inForeignTable = false;
      continue;
    }
    if (!inLocalTable && !inForeignTable) continue;

    const dateMatch = line.match(DATE_PREFIX);
    if (!dateMatch) {
      const recipient = inLocalTable ? extractTransferRecipient(line) : "";
      const last = transactions[transactions.length - 1];
      if (recipient && canAttachTransferRecipient(last) && !last.description.includes(recipient)) {
        last.description = `${last.description} - ${recipient}`;
        last.raw = `${last.raw ?? ""} ${line}`.trim();
      }
      continue;
    }

    const date = parseILDate(dateMatch[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const rest = stripMaxDateSuffix(dateMatch[2]);
    const tx = inLocalTable
      ? parseLocalRow(date, rest, line)
      : parseForeignRow(date, rest, line);

    if (tx) transactions.push(tx);
  }

  return transactions;
}
