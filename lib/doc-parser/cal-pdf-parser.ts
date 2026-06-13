/**
 * CAL (כאל / Diners) monthly statement parser — "דף פירוט דיגיטלי".
 *
 * pdf-parse extracts CAL's RTL table rows visually-reversed:
 *   "₪ 14.30₪ 14.30מזוןטוני וספה פיצה0202/10/20"
 * i.e. amounts first (charge ₪, then original amount), then sector+merchant
 * concatenated, ending with a character-reversed date ("0202/10/20" = 02/01/2020).
 * Latin merchant names come out mirrored too ("IANEPO" = OPENAI).
 * FX transactions span multiple lines, with the merchant+date on the last line.
 */

import { cleanAmount, parseILDate } from "./number-utils";
import { categorize } from "./categorizer";
import type { ParsedTransaction } from "./types";

// A reversed date at end of line: "4202/01/20" (reverse → 02/10/2024)
const REVERSED_DATE_END = /(\d{4}\/\d{2}\/\d{2})\s*$/;
// First ₪/plain amount in a record's opening line
const FIRST_AMOUNT = /-?\s?[\d,]+\.\d{2}/;

// Known CAL ענף (sector) labels — used to split the concatenated
// "<sector><merchant>" chunk. Longest-first so "מזון ומשקא" wins over "מזון".
const CAL_SECTORS = [
  "מזון ומשקאות",
  "מזון ומשקא",
  "רכב ותחבורה",
  "רכב ותחבור",
  "ריהוט ובית",
  "שירותי ייעוץ",
  "שירותי ייע",
  "פנאי בילוי",
  "בתי כלבו",
  "מסעדות",
  "תיירות",
  "אנרגיה",
  "פיננסים",
  "מחשבים",
  "מוסדות",
  "בריאות",
  "אופנה",
  "ביגוד",
  "חשמל",
  "תקשורת",
  "ביטוח",
  "חינוך",
  "ספורט",
  "שונות",
  "מזון",
  "דלק",
].sort((a, b) => b.length - a.length);

/** Reverse a character-mirrored date token: "4202/01/20" → ISO "2024-10-02". */
function parseReversedDate(token: string): string {
  const reversed = token.split("").reverse().join(""); // "02/10/2024"
  const iso = parseILDate(reversed);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

/** Un-mirror Latin runs that pdf-parse reversed inside RTL text. */
function fixLatinRuns(s: string): string {
  return s.replace(
    /[A-Za-z0-9][A-Za-z0-9 .,'"*&/\-]*[A-Za-z0-9]|[A-Za-z]/g,
    (run) => (/[A-Za-z]/.test(run) ? run.split("").reverse().join("") : run)
  );
}

/**
 * Split the concatenated "[הוצג][פירוט]<ענף><merchant>" chunk on the earliest
 * known sector label. Earliest occurrence wins (longest label on ties) so a
 * sector word inside the merchant name ("דלק רוקח") doesn't shadow the real
 * sector column ("אנרגיה") that precedes it.
 */
function splitSectorMerchant(chunk: string): { sector: string; merchant: string } {
  let bestIdx = -1;
  let bestSector = "";
  for (const sector of CAL_SECTORS) {
    const idx = chunk.indexOf(sector);
    if (idx === -1) continue;
    if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && sector.length > bestSector.length)) {
      bestIdx = idx;
      bestSector = sector;
    }
  }
  if (bestIdx !== -1 && chunk.length > bestIdx + bestSector.length + 1) {
    return { sector: bestSector, merchant: chunk.slice(bestIdx + bestSector.length).trim() };
  }
  return { sector: "", merchant: chunk.replace(/^לא\s*/, "") };
}

/** True when the text looks like a CAL/Diners digital statement. */
export function looksLikeCalStatement(text: string): boolean {
  return /פירוט עסקות שנצברו/.test(text);
}

/**
 * Parse transactions out of pdf-parse text of a CAL statement.
 * Returns [] when the format doesn't match, so callers can fall through.
 */
export function parseCalTransactions(lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let record: string[] = [];

  const flush = (dateToken: string) => {
    const date = parseReversedDate(dateToken);
    if (!date || record.length === 0) {
      record = [];
      return;
    }

    // Amount = first ₪ figure on the record's first line (the "סכום חיוב" column).
    const firstLine = record[0];
    const amountMatch = firstLine.match(FIRST_AMOUNT);
    if (!amountMatch) {
      record = [];
      return;
    }
    const amount = cleanAmount(amountMatch[0]);

    // Merchant lives just before the date — i.e. on the record's last line
    // (or the previous one when the date wrapped to its own line).
    let lastChunk = record[record.length - 1];
    if (!lastChunk && record.length >= 2) lastChunk = record[record.length - 2];
    // On single-line records strip the leading amounts.
    if (record.length === 1) {
      const amounts = lastChunk.match(/^(\s*-?[\d,.]+\s*)?(₪|\$|EU)?\s*-?[\d,]+\.\d{2}((₪|\$|EU)\s*-?[\d,]+\.\d{2})?/);
      if (amounts) lastChunk = lastChunk.slice(amounts[0].length);
    }
    lastChunk = lastChunk.replace(/[‏‎]/g, "").trim();

    let { merchant } = splitSectorMerchant(lastChunk);
    if (merchant.length < 3 && record.length > 1) {
      // Wrapped merchant name: the bulk sits on the first line after the
      // amounts, with a stray tail character on the following line(s).
      const amounts = record[0].match(/^(\s*-?[\d,.]+\s*)?(₪|\$|EU)?\s*-?[\d,]+\.\d{2}((₪|\$|EU)\s*-?[\d,]+\.\d{2})?/);
      const firstTail = amounts ? record[0].slice(amounts[0].length) : record[0];
      const joined = [firstTail, ...record.slice(1)].join(" ").replace(/[‏‎]/g, "").trim();
      merchant = splitSectorMerchant(joined).merchant;
    }
    const description = fixLatinRuns(merchant).replace(/\s+/g, " ").trim();

    const raw = record.join(" ") + " " + dateToken;
    record = [];

    if (!description || amount === 0) return; // cashback/zero rows are informational

    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount, // CAL convention: positive = charge/expense, negative = refund
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw,
    });
  };

  // Only rows between a "פירוט עסקות" table header and the page footer are
  // transactions — summary boxes above the table also start with ₪ amounts.
  let inTable = false;

  for (const line of lines) {
    if (/פירוט עסקות/.test(line)) {
      inTable = true;
      record = [];
      continue;
    }
    if (/עמוד \d+ מתוך|ט\.ל\.ח|סה"כ לתאריך/.test(line)) {
      inTable = false;
      record = [];
      continue;
    }
    if (!inTable) continue;

    const startsRecord = /^\s*₪|^\s*-?\d[\d,]*\.\d{2}/.test(line) && FIRST_AMOUNT.test(line);
    const dateMatch = line.match(REVERSED_DATE_END);

    if (record.length === 0) {
      if (!startsRecord) continue; // not inside a record, not an opener
      record.push(dateMatch ? line.replace(REVERSED_DATE_END, "").trim() : line);
      if (dateMatch) flush(dateMatch[1]);
    } else if (dateMatch) {
      record.push(line.replace(REVERSED_DATE_END, "").trim());
      flush(dateMatch[1]);
    } else if (startsRecord) {
      // New record opened before the previous one closed — drop the orphan.
      record = [line];
    } else {
      record.push(line);
    }
  }

  return transactions;
}
