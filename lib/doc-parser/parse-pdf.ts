/**
 * PDF Parser — Reads bank statement PDFs
 * Uses pdf-parse to extract text, then applies line-by-line parsing.
 * Enhanced with cleanAmount for aggressive number extraction.
 */

// @ts-ignore — pdf-parse has no proper type declarations
import pdfParse from "pdf-parse";
import { matchSynonym, detectBank } from "./synonyms";
import { cleanAmount, parseILDate } from "./number-utils";
import { categorize } from "./categorizer";
import { extractInstruments } from "./instruments";
import { extractBalances, reconcile } from "./reconciliation";
import type { ParsedDocument, ParsedTransaction } from "./types";

/**
 * Extract all numbers from a text fragment using aggressive cleaning.
 * Returns array of { value, start, end } for each found number.
 */
function extractNumbers(text: string): { value: number; start: number; end: number }[] {
  const results: { value: number; start: number; end: number }[] = [];

  // Match number-like patterns: digits with optional commas, dots, minus, currency symbols, parens
  const numberRegex = /[-−]?\s*[₪$]?\s*[\d,]+\.?\d*[-−]?|\([₪$]?\s*[\d,]+\.?\d*\)/g;
  let m;

  // Phone/ID pattern — skip numbers that look like phone numbers or IDs
  const phoneOrIdRegex = /^0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/;

  while ((m = numberRegex.exec(text)) !== null) {
    const raw = m[0].trim();
    // Skip phone numbers (05x-xxx-xxxx, 0x-xxxxxxx) and long ID-like numbers
    const digitsOnly = raw.replace(/[^\d]/g, "");
    if (phoneOrIdRegex.test(raw.replace(/[^\d-\s]/g, ""))) continue;
    if (digitsOnly.length >= 8 && !raw.includes(",") && !raw.includes(".") && !raw.includes("₪")) continue;

    const val = cleanAmount(raw);
    if (val !== 0 || /\d/.test(raw)) {
      // Filter out tiny numbers that are likely noise (reference numbers < 1)
      if (Math.abs(val) < 1 && Math.abs(val) !== 0) continue;
      results.push({ value: val, start: m.index, end: m.index + m[0].length });
    }
  }

  return results;
}

/**
 * Parse a PDF buffer into a ParsedDocument.
 */
export async function parsePDF(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const warnings: string[] = [];

  let text: string;
  try {
    const result = await pdfParse(buffer);
    text = result.text;
  } catch {
    return {
      filename,
      type: "pdf",
      bankHint: "לא זוהה",
      transactions: [],
      totalDebit: 0,
      totalCredit: 0,
      dateRange: { from: "", to: "" },
      warnings: ["שגיאה בקריאת PDF — ייתכן שהקובץ סרוק (תמונה). נסה להעלות קובץ Excel במקום."],
    };
  }

  const bankHint = detectBank(text);
  const isCreditCard = ["ישראכרט", "כאל", "מקס", "ויזה כאל", "אמריקן אקספרס"].some(
    cc => bankHint.includes(cc)
  );

  // Detect if PDF contains separate debit/credit headers
  const hasDebitCreditColumns = /חובה.*זכות|זכות.*חובה|debit.*credit|credit.*debit/i.test(text);

  // Split into lines and try to extract tabular data
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Strategy: look for lines that start with a date pattern
  const dateRegex = /^(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/;
  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const date = parseILDate(dateMatch[1]);
    if (!date) continue;

    // Remove the date from the line, then try to extract description and amounts
    const rest = line.substring(dateMatch[0].length).trim();

    // Extract all numbers from the rest of the line
    const numPositions = extractNumbers(rest);

    if (numPositions.length === 0) continue;

    // Description is everything before the first number
    const firstNumPos = numPositions[0]?.start ?? rest.length;
    const description = rest.substring(0, firstNumPos).trim()
      .replace(/[\u200F\u200E]/g, "")
      .replace(/\s+/g, " ");

    if (!description || description.length < 2) continue;

    // Amount logic depends on document type
    let amount = 0;

    if (hasDebitCreditColumns && numPositions.length >= 2) {
      // Bank format with separate debit/credit: first number = debit, second = credit
      const debit = numPositions[0].value;
      const credit = numPositions[1].value;

      if (debit !== 0 && credit === 0) {
        amount = Math.abs(debit); // Expense
      } else if (credit !== 0 && debit === 0) {
        amount = -Math.abs(credit); // Income
      } else if (debit !== 0) {
        amount = Math.abs(debit); // Both filled, take debit
      }
    } else if (isCreditCard) {
      // Credit card: usually single amount = expense
      // The last significant number is typically the ILS amount
      const ilsAmount = numPositions[numPositions.length - 1].value;
      amount = Math.abs(ilsAmount); // Credit card = expense
    } else if (numPositions.length >= 2) {
      // Multiple numbers — try debit/credit heuristic
      const first = numPositions[0].value;
      const second = numPositions[1].value;

      if (first !== 0 && second === 0) {
        amount = Math.abs(first);
      } else if (second !== 0 && first === 0) {
        amount = -Math.abs(second);
      } else {
        // Both non-zero: last number might be balance, take first as expense
        amount = Math.abs(first);
      }
    } else {
      // Single number
      amount = numPositions[0].value;
    }

    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw: line,
    });
  }

  if (transactions.length === 0) {
    warnings.push("לא זוהו תנועות בקובץ — ייתכן שזהו PDF סרוק. נסה להעלות את קובץ האקסל מהבנק.");
  }

  const totalDebit = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalCredit = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const dates = transactions.map(t => t.date).filter(Boolean).sort();

  // Extract financial instruments from the full PDF text
  const instruments = extractInstruments(text, bankHint);

  // ─── Reconciliation ───
  const { opening, closing } = extractBalances(text);
  const reconciliation = reconcile({
    openingBalance: opening,
    closingBalance: closing,
    transactions,
  });
  if (!reconciliation.ok || reconciliation.severity === "major") {
    warnings.push(reconciliation.message);
  }

  return {
    filename,
    type: "pdf",
    bankHint,
    transactions,
    totalDebit,
    totalCredit,
    dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
    warnings,
    instruments,
    openingBalance: opening,
    closingBalance: closing,
    reconciliation: {
      ok: reconciliation.ok,
      severity: reconciliation.severity,
      message: reconciliation.message,
      delta: reconciliation.delta,
      computed: reconciliation.computed,
    },
  };
}
