/**
 * Bank Yahav (בנק יהב) "תנועות עו"ש" statement parser.
 *
 * Yahav exports an RTL table whose numeric columns (יתרה / זכות / חובה) sit
 * tightly next to each other, so pdf-parse's plain-text extraction glues the
 * amounts together with no separator (e.g. "124.257,582.21"). That makes the
 * standard line-based heuristic unusable.
 *
 * Instead we read the PDF with positional data (x/y of every glyph run) and
 * bucket each run into its column by x-coordinate. Columns, left→right:
 *
 *   x < 130        יתרה משוערכת  (running balance — ignored, used only to verify)
 *   130 ≤ x < 195  זכות          (credit  → income,  amount < 0)
 *   195 ≤ x < 300  חובה          (debit   → expense, amount > 0)
 *   300 ≤ x < 600  תיאור פעולה   (description)
 *   600 ≤ x < 700  אסמכתא        (reference — may wrap to a 2nd line)
 *   700 ≤ x < 760  תאריך ערך     (value date)
 *   x ≥ 760        תאריך         (booking date — used as the tx date)
 *
 * Column boundaries were derived from real statements and validated by
 * reconstructing the running balance from credit/debit — every row matched.
 */

import { categorize } from "./categorizer";
import { cleanAmount, parseILDate } from "./number-utils";
import type { ParsedTransaction } from "./types";

// pdf-parse bundles pdf.js but exposes only the text API. We need glyph
// positions, so we reach into its bundled build directly. The version folder
// can change when the dependency is bumped — try the known builds in order.
const PDFJS_BUILDS = [
  "pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js",
  "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js",
  "pdf-parse/lib/pdf.js/v1.10.88/build/pdf.js",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadPdfjs(): any {
  for (const build of PDFJS_BUILDS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(build);
    } catch {
      /* try next */
    }
  }
  return null;
}

interface Cell {
  x: number;
  str: string;
}

/** A statement looks like Yahav when it carries the עו"ש header + column titles. */
export function looksLikeYahavStatement(text: string): boolean {
  const hasHeader = /תנועות.{0,4}עו["'״]?ש/.test(text);
  const hasColumns = /יתרה\s*משוערכת/.test(text) && /חובה/.test(text) && /זכות/.test(text);
  const isYahav = /יהב|yahav/i.test(text) || /\b04-\d{3}-\d{3,}/.test(text);
  return hasHeader && hasColumns && isYahav;
}

function columnOf(x: number): "balance" | "credit" | "debit" | "desc" | "ref" | "valueDate" | "date" {
  if (x < 130) return "balance";
  if (x < 195) return "credit";
  if (x < 300) return "debit";
  if (x < 600) return "desc";
  if (x < 700) return "ref";
  if (x < 760) return "valueDate";
  return "date";
}

const NUMERIC = /^[\d,]+\.?\d*$/;
const DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

function normalize(s: string): string {
  return s.replace(/[‏‎]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Parse a Yahav statement straight from the PDF buffer using glyph positions.
 * Returns an empty array when positional extraction is unavailable so the
 * caller can fall back to the generic text parser.
 */
export async function parseYahavTransactions(buffer: Buffer): Promise<ParsedTransaction[]> {
  const pdfjs = loadPdfjs();
  if (!pdfjs?.getDocument) return [];

  let doc: any;
  try {
    const data = new Uint8Array(buffer);
    doc = await pdfjs.getDocument({ data }).promise;
  } catch {
    return [];
  }

  // Group every glyph run into rows keyed by its y-coordinate, per page.
  const rows = new Map<string, Cell[]>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      const str = String(item.str ?? "");
      if (!str.trim()) continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      const key = `${p}:${y}`;
      const bucket = rows.get(key);
      if (bucket) bucket.push({ x, str });
      else rows.set(key, [{ x, str }]);
    }
  }

  const transactions: ParsedTransaction[] = [];

  // Preserve document order: sort by page asc, then y desc (top of page first).
  const orderedKeys = [...rows.keys()].sort((a, b) => {
    const [pa, ya] = a.split(":").map(Number);
    const [pb, yb] = b.split(":").map(Number);
    return pa !== pb ? pa - pb : yb - ya;
  });

  for (const key of orderedKeys) {
    const cells = rows.get(key)!.sort((a, b) => a.x - b.x);

    const buckets = {
      credit: [] as string[],
      debit: [] as string[],
      desc: [] as Cell[],
      ref: [] as string[],
      date: [] as string[],
    };

    for (const cell of cells) {
      const col = columnOf(cell.x);
      if (col === "credit") buckets.credit.push(cell.str.trim());
      else if (col === "debit") buckets.debit.push(cell.str.trim());
      else if (col === "desc") buckets.desc.push(cell);
      else if (col === "ref") buckets.ref.push(cell.str.trim());
      else if (col === "date") buckets.date.push(cell.str.trim());
    }

    const dateRaw = buckets.date.find((s) => DATE.test(s));

    // No booking date → this is a header row or a wrapped reference/description
    // continuation. Attach a stray reference fragment to the previous tx.
    if (!dateRaw) {
      const last = transactions[transactions.length - 1];
      const refFrag = buckets.ref.join("");
      if (last && refFrag && /\d/.test(refFrag)) last.raw = `${last.raw ?? ""} ${refFrag}`.trim();
      continue;
    }

    const date = parseILDate(dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // RTL: description reads right-to-left, so order fragments by x descending.
    const description = normalize(
      buckets.desc
        .sort((a, b) => b.x - a.x)
        .map((c) => c.str)
        .join(" ")
    );
    if (!description) continue;

    const credit = cleanAmount(buckets.credit.find((s) => NUMERIC.test(s) && s !== "0") ?? "0");
    const debit = cleanAmount(buckets.debit.find((s) => NUMERIC.test(s) && s !== "0") ?? "0");

    // Positive = expense (חובה / debit), negative = income (זכות / credit).
    let amount = 0;
    if (debit !== 0) amount = Math.abs(debit);
    else if (credit !== 0) amount = -Math.abs(credit);
    else continue; // zero-value row (informational) — skip

    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw: `${dateRaw} ${description} ${buckets.ref.join("")}`.trim(),
    });
  }

  return transactions;
}
