/**
 * Excel Parser — Reads .xlsx/.xls bank statements
 * Auto-detects header row and maps columns using synonym dictionary.
 * Supports Israeli bank formats (Hapoalim, Leumi, etc.) and credit cards (Isracard, Max, Cal).
 */

import * as XLSX from "xlsx";
import { matchSynonym, detectBank, type CanonicalField } from "./synonyms";
import { cleanAmount, parseILDate } from "./number-utils";
import { categorize } from "./categorizer";
import { extractInstruments } from "./instruments";
import { extractBalances, reconcile } from "./reconciliation";
import type { ParsedDocument, ParsedTransaction, ColumnMapping } from "./types";

/**
 * Detect if a column header suggests a "combined amount" column
 * (single column with + for income, - for expense)
 */
function isCombinedAmountHeader(header: string): boolean {
  const lower = header.trim().replace(/[\u200F\u200E]/g, "").toLowerCase();
  return ["סכום", "amount", "סכום העסקה", "סכום בש\"ח"].includes(lower);
}

/**
 * Detect if this is a credit card format (single amount column = expense)
 */
function isCreditCardBank(bankHint: string): boolean {
  return ["ישראכרט", "כאל", "מקס", "ויזה כאל", "אמריקן אקספרס"].some(
    cc => bankHint.includes(cc)
  );
}

/**
 * Parse an Excel buffer into a ParsedDocument.
 */
export function parseExcel(buffer: Buffer, filename: string): ParsedDocument {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  const warnings: string[] = [];
  const fullText = rows.flat().join(" ");
  const bankHint = detectBank(fullText);
  const isCreditCard = isCreditCardBank(bankHint);

  // Find header row — scan first 15 rows for one that has ≥2 synonym matches
  let headerRowIdx = -1;
  let mapping: ColumnMapping | null = null;
  let hasSeparateDebitCredit = false;
  let headerRow: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const detected: Partial<Record<CanonicalField, number>> = {};
    let matchCount = 0;

    for (let col = 0; col < row.length; col++) {
      const cellText = String(row[col]).trim();
      if (!cellText) continue;

      const field = matchSynonym(cellText);
      if (field && !detected[field]) {
        detected[field] = col;
        matchCount++;
      }
    }

    if (matchCount >= 2 && detected.date !== undefined && (detected.description !== undefined || detected.debit !== undefined)) {
      headerRowIdx = i;
      headerRow = row.map(c => String(c));

      // Check if we have BOTH debit and credit columns (bank format)
      hasSeparateDebitCredit = detected.debit !== undefined && detected.credit !== undefined;

      mapping = {
        date: detected.date ?? -1,
        description: detected.description ?? -1,
        debit: detected.debit ?? -1,
        credit: detected.credit ?? -1,
        balance: detected.balance,
      };
      break;
    }
  }

  if (headerRowIdx === -1 || !mapping) {
    warnings.push("לא זוהתה שורת כותרות — נסה להעלות קובץ עם כותרות ברורות");
    return {
      filename,
      type: "xlsx",
      bankHint,
      transactions: [],
      totalDebit: 0,
      totalCredit: 0,
      dateRange: { from: "", to: "" },
      warnings,
    };
  }

  // Detect if debit column is actually a "combined amount" column
  const debitHeader = mapping.debit >= 0 ? headerRow[mapping.debit] || "" : "";
  const isCombinedColumn = !hasSeparateDebitCredit && isCombinedAmountHeader(debitHeader);

  // Parse data rows
  const transactions: ParsedTransaction[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawDate = String(row[mapping.date] ?? "");
    const date = parseILDate(rawDate);
    if (!date || date.length < 6) continue; // skip non-data rows

    // Get description — try description column, fallback to any text column
    let description = "";
    if (mapping.description >= 0) {
      description = String(row[mapping.description] ?? "").trim();
    }
    if (!description) {
      // Fallback: find first non-empty non-numeric cell after date
      for (let col = 0; col < row.length; col++) {
        if (col === mapping.date || col === mapping.debit || col === mapping.credit) continue;
        const cell = String(row[col]).trim();
        if (cell && cell.length >= 2 && !/^[\d,.₪$\-\(\)]+$/.test(cell)) {
          description = cell;
          break;
        }
      }
    }
    if (!description) continue;

    // ═══ Amount Extraction — Core Fix ═══
    const rawDebit = mapping.debit >= 0 ? row[mapping.debit] : undefined;
    const rawCredit = mapping.credit >= 0 ? row[mapping.credit] : undefined;

    const debitVal = cleanAmount(rawDebit);
    const creditVal = cleanAmount(rawCredit);

    let amount = 0;

    if (hasSeparateDebitCredit) {
      // ── Bank format: separate חובה / זכות columns ──
      // Israeli banks: חובה = money going OUT (expense, positive in our model)
      //                זכות = money coming IN (income, negative in our model)
      const hasDebit = rawDebit !== undefined && String(rawDebit).trim() !== "" && debitVal !== 0;
      const hasCredit = rawCredit !== undefined && String(rawCredit).trim() !== "" && creditVal !== 0;

      if (hasDebit && hasCredit) {
        // Both filled — take whichever is non-zero. Debit wins if both are non-zero.
        amount = debitVal !== 0 ? Math.abs(debitVal) : -Math.abs(creditVal);
      } else if (hasDebit) {
        // Expense: always positive
        amount = Math.abs(debitVal);
      } else if (hasCredit) {
        // Income: always negative
        amount = -Math.abs(creditVal);
      }
    } else if (isCreditCard) {
      // ── Credit card format: single "סכום חיוב" column ──
      // For credit cards, the amount column is always an expense (positive).
      // Refunds appear as negative in the same column.
      if (debitVal !== 0) {
        amount = debitVal; // Positive = expense, negative = refund
      } else if (creditVal !== 0) {
        amount = -Math.abs(creditVal); // Credit column = refund
      }
    } else if (isCombinedColumn) {
      // ── Combined amount column (positive = expense, negative = income) ──
      amount = debitVal;
    } else {
      // ── Fallback: try to determine from available columns ──
      if (debitVal !== 0) {
        amount = Math.abs(debitVal); // Expense
      } else if (creditVal !== 0) {
        amount = -Math.abs(creditVal); // Income
      }
    }

    // Skip rows where amount couldn't be determined
    if (amount === 0) {
      // Check if there's ANY numeric value in other columns we might have missed
      for (let col = 0; col < row.length; col++) {
        if (col === mapping.date || col === mapping.description || col === mapping.debit || col === mapping.credit) continue;
        if (mapping.balance !== undefined && col === mapping.balance) continue;
        const fallbackVal = cleanAmount(row[col]);
        if (fallbackVal !== 0) {
          amount = fallbackVal;
          break;
        }
      }
    }

    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      category: cat.key,
      categoryLabel: cat.label,
      raw: row.join(" | "),
    });
  }

  if (transactions.length === 0 && rows.length > 1) {
    warnings.push("לא זוהו תנועות — ייתכן שהפורמט לא תואם. בדוק שיש כותרות ברורות בקובץ.");
  }

  const totalDebit = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalCredit = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const dates = transactions.map(t => t.date).filter(Boolean).sort();

  // Extract financial instruments from full sheet text (headers + metadata rows)
  const instruments = extractInstruments(fullText, bankHint);

  // ─── Reconciliation: extract opening/closing balances and verify totals ───
  const { opening, closing } = extractBalances(fullText);
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
    type: "xlsx",
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
