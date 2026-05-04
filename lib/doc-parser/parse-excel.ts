/**
 * Excel Parser — Reads .xlsx/.xls bank statements
 * Auto-detects header row and maps columns using synonym dictionary.
 * Supports Israeli bank formats (Hapoalim, Leumi, etc.) and credit cards (Isracard, Max, Cal).
 */

import * as XLSX from "xlsx";
import { matchSynonymScored, detectBank, type CanonicalField } from "./synonyms";
import { cleanAmount, parseILDate } from "./number-utils";
import { categorize } from "./categorizer";
import { extractInstruments } from "./instruments";
import { extractBalances, reconcile } from "./reconciliation";
import type { ParsedDocument, ParsedTransaction, ColumnMapping } from "./types";

/**
 * Extract plain text that lives OUTSIDE <table> blocks in an HTML-as-XLS file.
 * Used to find metadata (account numbers, customer name, balance summary) that
 * sits in headers/footers or floats above the transactions table.
 *
 * CRITICAL: we strip <table> blocks first, otherwise transaction descriptions
 * (which often mention other banks/cards) bleed into bank-name detection.
 */
function stripHtmlToText(buffer: Buffer): string {
  const text = buffer.toString("utf8");
  if (!/<html/i.test(text.slice(0, 500))) return "";
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<table[\s\S]*?<\/table>/gi, " ") // ← strip table content
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[\u200E\u200F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse HTML-as-XLS files (common in Israeli bank exports, especially Leumi).
 * These are HTML files saved with .xls extension.
 */
function parseHtmlToRows(buffer: Buffer): string[][] | null {
  // Try UTF-8 first, then try with BOM handling
  let text = buffer.toString("utf8");

  // Check if it's HTML
  if (!/<html/i.test(text.slice(0, 500))) return null;

  const rows: string[][] = [];
  // Find all <tr> blocks
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(text)) !== null) {
    const trContent = trMatch[1];
    const cells: string[] = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      // Strip HTML tags, decode entities, trim
      let cell = tdMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/[\r\n]+/g, " ")
        .trim();
      cells.push(cell);
    }
    if (cells.length >= 2) {
      rows.push(cells);
    }
  }

  return rows.length > 0 ? rows : null;
}

/**
 * Detect if a column header suggests a "combined amount" column
 * (single column with + for income, - for expense)
 */
function isCombinedAmountHeader(header: string): boolean {
  const lower = header
    .trim()
    .replace(/[\u200F\u200E]/g, "")
    .toLowerCase();
  return ["סכום", "amount", "סכום העסקה", 'סכום בש"ח', "₪ זכות/חובה", "זכות/חובה"].includes(lower);
}

/**
 * Detect if this is a credit card format (single amount column = expense)
 */
function isCreditCardBank(bankHint: string): boolean {
  return [
    "ישראכרט",
    "כאל",
    "מקס",
    "ויזה כאל",
    "ויזה",
    "אמריקן אקספרס",
    "דיינרס",
    "לאומי קארד",
  ].some((cc) => bankHint.includes(cc));
}

/**
 * Parse an Excel buffer into a ParsedDocument.
 */
export function parseExcel(buffer: Buffer, filename: string): ParsedDocument {
  // ─── Check for HTML-as-XLS (common in Israeli bank exports, especially Leumi) ───
  const htmlRows = parseHtmlToRows(buffer);
  // When HTML is used, keep the full stripped text so metadata *outside* <tr>
  // (account numbers, balances, customer name) is still visible for detection.
  const htmlMetaText = htmlRows ? stripHtmlToText(buffer) : "";

  let rows: string[][];

  if (htmlRows) {
    rows = htmlRows;
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    // ─── Pick best sheet ────────────────────────────────────────────────
    // Numbers (Mac) exports put real data in "גיליון1"/"Sheet1" and the first
    // sheet is a metadata summary ("סיכום פעולת הייצוא"). Also some bank
    // exports put cover/summary tabs first. Strategy:
    //   1. Skip sheets whose name contains "סיכום"/"summary"/"cover".
    //   2. From remaining, pick the sheet with the most NON-EMPTY rows.
    //   3. Fallback: first sheet.
    const candidateSheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: "",
        raw: false,
      }) as string[][],
    })).map((s) => ({
      ...s,
      nonEmpty: s.rows.filter((r) => r && r.some((c) => String(c).trim() !== "")).length,
    }));

    const isSummaryName = (n: string) => /סיכום|summary|cover|index/i.test(n);

    let pick =
      candidateSheets
        .filter((s) => !isSummaryName(s.name))
        .sort((a, b) => b.nonEmpty - a.nonEmpty)[0] ??
      candidateSheets.sort((a, b) => b.nonEmpty - a.nonEmpty)[0];

    rows = pick?.rows ?? [];
  }

  const warnings: string[] = [];

  // Find header row FIRST — we need it to restrict bank detection to metadata only
  // (transaction descriptions can contain other bank names and mislead detection)
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

      const hit = matchSynonymScored(cellText);
      if (!hit) continue;
      // CRITICAL: must check `=== undefined` not `!detected[field]`, because
      // col 0 is a valid column index but `!0 === true` would let col 1
      // overwrite it (this caused the Hapoalim HTML-as-XLS parser to misalign
      // the date column and drop almost all rows).
      // FIRST MATCH WINS — bank exports almost always put the primary column
      // (e.g. "תאריך" the transaction date) before the secondary one
      // ("תאריך ערך" value date). Preferring later/longer matches broke Yael's
      // Hapoalim HTML export whose value-date column is empty. The
      // HEADER_BLACKLIST in synonyms.ts handles the "קוד פעולה" vs "הפעולה"
      // trap by excluding code columns before they can claim the slot.
      if (detected[hit.field] === undefined) {
        detected[hit.field] = col;
        matchCount++;
      }
    }

    if (
      matchCount >= 2 &&
      detected.date !== undefined &&
      (detected.description !== undefined || detected.debit !== undefined)
    ) {
      headerRowIdx = i;
      headerRow = row.map((c) => String(c));

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

  // Detect bank from metadata rows only (before header), NOT from transaction descriptions
  // This prevents false matches when transaction text mentions other banks (e.g. "העברה מ...בנק הפועלים")
  const metadataText = [
    rows
      .slice(0, Math.max(headerRowIdx, 0) + 1)
      .flat()
      .join(" "),
    htmlMetaText,
  ]
    .filter(Boolean)
    .join(" ");
  const fullText = [rows.flat().join(" "), htmlMetaText].filter(Boolean).join(" ");
  let bankHint = detectBank(metadataText);
  // Header-based bank detection for banks that don't mention their name in metadata
  if (bankHint === "לא זוהה") {
    const headerText = headerRow.join(" ").toLowerCase();
    if (headerText.includes("זכות/חובה") || headerText.includes("ערוץ ביצוע")) {
      bankHint = "בנק דיסקונט";
    } else if (headerText.includes("בחובה") && headerText.includes("בזכות")) {
      bankHint = "בנק לאומי";
    }
    // NOTE: we do NOT try to distinguish Leumi from Hapoalim based on the
    // "סוג תנועה" + "תאריך ערך" header combo alone — both banks export
    // HTML tables with that exact layout, and without a unique metadata
    // keyword we'd misclassify one for the other. Let detectBank(fullText)
    // handle the ambiguous cases via transaction-description signals; if it
    // still can't tell, bankHint stays "לא זוהה" which is truthful.
  }
  // Fallback to full text only if still unidentified.
  // For bank-format files (separate חובה/זכות columns) skip credit-card brand
  // detection — those names are usually noise from transaction descriptions
  // (e.g. "ישראכרט (י)" rows in a Hapoalim checking account).
  if (bankHint === "לא זוהה") {
    bankHint = detectBank(fullText, { skipCreditCards: hasSeparateDebitCredit });
  }
  const isCreditCard = isCreditCardBank(bankHint);

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

  // ─── Detect date format: DD/MM or M/D ───
  // Scan date column — if ANY value has second number > 12, the format must be M/D/YY
  let isMonthDayYear = false;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const raw = String(rows[i]?.[mapping.date] ?? "")
      .trim()
      .replace(/[\u200F\u200E]/g, "");
    const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m && parseInt(m[2]) > 12) {
      isMonthDayYear = true;
      break;
    }
  }

  // Parse data rows
  const transactions: ParsedTransaction[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawDate = String(row[mapping.date] ?? "");
    let date: string;
    if (isMonthDayYear) {
      // M/D/YY format — swap month and day before parsing as DD/MM/YYYY
      const cleaned = rawDate.trim().replace(/[\u200F\u200E]/g, "");
      const dm = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (dm) {
        // dm[1]=month, dm[2]=day → rewrite as day/month/year for parseILDate
        date = parseILDate(`${dm[2]}/${dm[1]}/${dm[3]}`);
      } else {
        date = parseILDate(rawDate);
      }
    } else {
      date = parseILDate(rawDate);
    }
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
      const hasCredit =
        rawCredit !== undefined && String(rawCredit).trim() !== "" && creditVal !== 0;

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
      // ── Combined amount column ──
      // For Israeli bank combined columns (e.g. Discount "₪ זכות/חובה"):
      //   positive = income (credit), negative = expense (debit)
      // Our model: positive = expense, negative = income → negate
      amount = -debitVal;
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
        if (
          col === mapping.date ||
          col === mapping.description ||
          col === mapping.debit ||
          col === mapping.credit
        )
          continue;
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
      confidence: cat.confidence,
      raw: row.join(" | "),
    });
  }

  if (transactions.length === 0 && rows.length > 1) {
    warnings.push("לא זוהו תנועות — ייתכן שהפורמט לא תואם. בדוק שיש כותרות ברורות בקובץ.");
  }

  const totalDebit = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalCredit = transactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const dates = transactions
    .map((t) => t.date)
    .filter(Boolean)
    .sort();

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
