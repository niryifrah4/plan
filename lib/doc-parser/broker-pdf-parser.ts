/**
 * ═══════════════════════════════════════════════════════════
 *  Broker PDF Parser — investment-house statements
 * ═══════════════════════════════════════════════════════════
 *
 * Two-tier strategy (deterministic first, AI fallback):
 *
 *   1. extractBrokerPdf()        — decrypt (password-protected files supported)
 *                                  and pull out the PDF text layer, both as
 *                                  positioned items (x/y) and as a reconstructed
 *                                  string.
 *   2. tryDeterministicParse()   — column-based table reader keyed on the
 *                                  detected "פירוט יתרות" header positions. It
 *                                  ONLY returns a result when it RECONCILES:
 *                                  the summed holding values must match the
 *                                  printed grand total (סה"כ). If the text layer
 *                                  is staggered / doubled / otherwise messy, or
 *                                  the layout is unrecognized, it returns null.
 *   3. analyzeBrokerReport()     — Claude fallback. Used only when the
 *                                  deterministic pass can't confidently parse.
 *
 * Server-side ONLY (reads ANTHROPIC_API_KEY / PLANAPI via anthropic-client).
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, getAnthropicKey } from "@/lib/anthropic-client";

/** Sonnet is plenty for structured table extraction and ~5× cheaper than Opus. */
const MODEL = "claude-sonnet-4-6";

/* ─────────────────────────────────────────────────────────────
   Errors — the API route maps these to specific HTTP codes so the
   UI can prompt for a password / surface the right message.
   ───────────────────────────────────────────────────────────── */

export class PdfPasswordRequiredError extends Error {
  constructor() {
    super("PDF_PASSWORD_REQUIRED");
    this.name = "PdfPasswordRequiredError";
  }
}
export class PdfPasswordWrongError extends Error {
  constructor() {
    super("PDF_PASSWORD_WRONG");
    this.name = "PdfPasswordWrongError";
  }
}

/* ─────────────────────────────────────────────────────────────
   Structured result shape
   ───────────────────────────────────────────────────────────── */

export type AssetKindGuess = "stock" | "etf" | "crypto" | "bond" | "fund" | "cash";

export interface BrokerHolding {
  /** Security number (מספר נייר) when present. */
  securityNumber: string;
  /** Display name as printed (e.g. "NVIDIA(NVDA)", "איישרס.ח SP 500"). */
  name: string;
  /** Best-guess ticker for market sync (NVDA, QQQ, …). Empty when unknown. */
  symbol: string;
  /** stock | etf | crypto | bond | fund | cash. cash = currency/balance rows. */
  assetKind: AssetKindGuess;
  quantity: number;
  /** Current quote as printed (שער נוכחי) — agorot for ILS-listed securities. */
  priceCurrent: number;
  /** Total value of the holding, in ILS (שווי נייר בשקלים). */
  valueIls: number;
  /** Total purchase cost, in ILS (עלות רכישה). */
  costIls: number;
  /** % of the whole portfolio (אחוז מהתיק). */
  pctOfPortfolio: number;
}

export interface BrokerTransaction {
  /** Value date / execution date, ISO YYYY-MM-DD when resolvable. */
  date: string;
  /** Operation in Hebrew (קניה, מכירה, הפקדה, דיבידנד, דמי ניהול …). */
  type: string;
  /** Security name / description. */
  name: string;
  quantity: number;
  /** Charge (+) / credit (−) amount where shown. */
  amount: number;
}

export interface BrokerReport {
  broker: string;
  accountNumber: string;
  /** Statement "as of" date, ISO YYYY-MM-DD when resolvable. */
  reportDate: string;
  currency: string;
  totalValueIls: number;
  holdings: BrokerHolding[];
  transactions: BrokerTransaction[];
  warnings: string[];
}

export interface PdfTextItem {
  x: number;
  y: number;
  str: string;
  page: number;
}

export interface ExtractedPdf {
  items: PdfTextItem[];
  /** Position-ordered reconstruction (rows top→bottom, cells left→right). */
  text: string;
}

/* ─────────────────────────────────────────────────────────────
   Stage 1 — decrypt + extract text via bundled pdf.js
   ───────────────────────────────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadPdfjs(): any {
  // The pdf.js build that ships inside pdf-parse. pdf-parse is already in
  // serverExternalPackages, so this resolves at runtime on the Node server.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
}

/**
 * Decrypt (if needed) and extract the text layer as positioned items plus a
 * row-reconstructed string.
 *
 * @throws PdfPasswordRequiredError  encrypted, no password supplied
 * @throws PdfPasswordWrongError     password supplied but rejected
 */
export async function extractBrokerPdf(buffer: Buffer, password?: string): Promise<ExtractedPdf> {
  const pdfjs = loadPdfjs();
  const data = new Uint8Array(buffer);

  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data, password: password || undefined }).promise;
  } catch (err: any) {
    // PasswordException: code 1 = need password, code 2 = incorrect password.
    if (err?.name === "PasswordException") {
      if (err.code === 2) throw new PdfPasswordWrongError();
      throw new PdfPasswordRequiredError();
    }
    throw err;
  }

  const items: PdfTextItem[] = [];
  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as any[]) {
      const x = it.transform[4];
      const y = it.transform[5];
      const s = it.str;
      if (!s || !s.trim()) continue;
      items.push({ x, y, str: s, page: p });
      const yk = Math.round(y);
      const arr = rows.get(yk) || [];
      arr.push({ x, s });
      rows.set(yk, arr);
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a); // top → bottom
    const lines: string[] = [];
    for (const y of ys) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((o) => o.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) lines.push(line);
    }
    pageTexts.push(lines.join("\n"));
  }
  return { items, text: pageTexts.join("\n\n") };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─────────────────────────────────────────────────────────────
   Stage 2 — deterministic table parse (with reconciliation guard)
   ───────────────────────────────────────────────────────────── */

function parseNum(s: string): number | null {
  const cleaned = s.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

const HEADER_TOKENS = {
  securityNumber: "מספר נייר",
  name: "שם נייר",
  quantity: "כמות",
  price: "שער",
  cost: "עלות",
  value: "בשקלים",
  pct: "אחוז",
};

/** Detect a ticker like "NVIDIA(NVDA)" → "NVDA", "INVESCO (QQQ)" → "QQQ". */
function guessSymbol(name: string): string {
  const m = name.match(/\(([A-Za-z0-9.\-]{1,8})\)/);
  if (m) return m[1].toUpperCase();
  const latin = name.match(/[A-Za-z0-9.\-]{2,}/g);
  return latin ? latin.join(" ").toUpperCase() : "";
}

/**
 * pdf.js emits Hebrew glyph-by-glyph in visual (reversed) order, so a Hebrew
 * security name can arrive scrambled (e.g. "מגן מס" → "סמ ןגמ"). We can't fully
 * recover word spacing, but we CAN classify and canonical-label the standard
 * cash/balance rows by matching either the raw or reversed string.
 */
function canonicalCashName(name: string): string | null {
  const probe = name + "|" + name.split("").reverse().join("");
  if (/דולר|רלוד/.test(probe)) return 'דולר ארה"ב';
  if (/יורו|ורוי/.test(probe)) return "יורו";
  if (/מגן\s?מס|ןגמ/.test(probe)) return "מגן מס";
  if (/כספית|תיפסכ|יתרה|הרתי|מזומן/.test(probe)) return "יתרה כספית";
  return null;
}

function guessKind(name: string): AssetKindGuess {
  // Test the name AND its reverse, since Hebrew may arrive reversed.
  const n = (name + " " + name.split("").reverse().join("")).toLowerCase();
  if (/דולר|רלוד|יורו|ורוי|מטבע|כספית|תיפסכ|יתרה|הרתי|מזומן|מגן מס|ןגמ|cash|usd|eur/.test(n))
    return "cash";
  if (/btc|eth|crypto|grayscale|ethe|ezbc|bitcoin|קריפ/.test(n)) return "crypto";
  if (/אג["׳']?ח|bond|ממשלת|מק["׳']?מ/.test(n)) return "bond";
  if (/קרן נאמנות|mutual|קרן כספית/.test(n)) return "fund";
  if (/etf|sp ?500|nsdq|nasdaq|s&p|qqq|מדד|סל|תעודת/.test(n)) return "etf";
  return "stock";
}

function parseBlinkTransactions(text: string): BrokerTransaction[] {
  const transactions: BrokerTransaction[] = [];
  const typeTokens = ["הפקדה", "משיכה", "קנייה", "קניה", "מכירה", "דיבידנד", "חיוב מס"];
  for (const line of text.split(/\n+/)) {
    const dateMatch = line.match(/(\d{2})[/.](\d{2})[/.](\d{4})/);
    if (!dateMatch) continue;
    const type = typeTokens.find((token) => line.includes(token));
    if (!type) continue;
    const lineWithoutDate = line.replace(dateMatch[0], "");
    const nums = [...lineWithoutDate.matchAll(/-?\d[\d,]*\.\d+|-?\d[\d,]*/g)]
      .map((m) => parseNum(m[0]))
      .filter((v): v is number => v != null);
    const symbolMatch = line.match(/\b[A-Z][A-Z0-9.]{1,9}\b/);
    let amount = 0;
    if (type.includes("הפקדה") || type.includes("משיכה")) {
      amount = nums.length ? Math.abs(nums[nums.length - 1]) : 0;
      if (type.includes("משיכה")) amount *= -1;
    }
    transactions.push({
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      type,
      name: symbolMatch?.[0] ?? "",
      quantity: 0,
      amount,
    });
  }
  return transactions;
}

function toIsoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateMatch(m: RegExpMatchArray): string {
  let year = +m[3];
  if (year > 0 && year < 100) year += 2000;
  return toIsoDate(+m[1], +m[2], year);
}

function detectBlinkReportDate(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const datePattern = String.raw`(\d{2})[/.-](\d{2})[/.-](\d{2,4})`;
  const preferredPatterns = [
    new RegExp(String.raw`לתאריך${datePattern}`),
    new RegExp(String.raw`פירוטיתרותליום${datePattern}`),
    new RegExp(String.raw`יתרותליום${datePattern}`),
  ];

  for (const pattern of preferredPatterns) {
    const match = compact.match(pattern);
    if (match) return parseDateMatch(match);
  }

  return detectReportDate(text);
}

/**
 * Deterministic reader for the "פירוט יתרות" holdings table of an Israeli
 * trading-account statement (the IBI/אי.בי.אי template and look-alikes).
 *
 * The PDF text layer is adversarial: every glyph is drawn twice (a shadow copy
 * offset by ~(−28, +12)) and two data streams sit ~1pt apart vertically, so a
 * naïve row read interleaves columns. The pipeline that survives this:
 *
 *   1. Drop shadow copies — an item is a shadow if an identical-string twin
 *      exists at (x−SHADOW_DX, y+SHADOW_DY).
 *   2. Anchor on the canonical security-number column (right edge, x near the
 *      "מספר נייר" header). Each holding = one anchor.
 *   3. For every column, pick the numeric cell on the SAME baseline as the
 *      anchor (nearest-y wins) — this rejects the parallel stream 1pt away.
 *   4. RECONCILE: Σ(value) must equal the printed grand total (סה"כ). If the
 *      layout is unknown / the shadow offset differs / streams don't separate,
 *      reconciliation fails and we return null so the caller falls back to AI
 *      instead of emitting confidently-wrong numbers.
 */
const SHADOW_DX = 28;
const SHADOW_DY = 12;

function tryBlinkParse(extracted: ExtractedPdf): BrokerReport | null {
  const text = extracted.text;
  if (!text.includes("heyblink.com") && !text.includes("Blink")) return null;

  const raw = extracted.items.filter((it) => it.page === 1 || it.page === undefined);
  if (raw.length === 0) return null;

  const BLINK_HEADERS = {
    pct: "אחוז",
    value: "שווי",
    price: "מחיר",
    quantity: "כמות",
    name: "שם הנייר"
  };

  const headerXs: Record<string, number> = {};
  let headerY: number | null = null;
  let totalY: number | null = null;

  for (const it of raw) {
    const s = it.str.replace(/\s+/g, " ").trim();
    for (const [key, token] of Object.entries(BLINK_HEADERS)) {
      if (headerXs[key] == null && s.includes(token)) {
        headerXs[key] = it.x;
        if (headerY == null) headerY = it.y;
      }
    }
    if (totalY == null && (s.includes('סה"כ') || s.includes("סה״כ"))) totalY = it.y;
  }

  if (headerY == null || totalY == null || headerXs.value == null || headerXs.name == null) {
    return null;
  }

  const totalValue = raw
    .filter((it) => Math.abs(it.y - totalY!) <= 4)
    .map((it) => parseNum(it.str))
    .filter((v): v is number => v != null)
    .reduce((mx, v) => Math.max(mx, v), 0) || 0;

  if (totalValue <= 0) return null;

  const rowsByY = new Map<number, PdfTextItem[]>();
  for (const it of raw) {
    if (it.y > headerY - 3 || it.y < totalY + 2) continue;
    
    let foundY: number | null = null;
    for (const y of rowsByY.keys()) {
      if (Math.abs(y - it.y) <= 4) {
        foundY = y;
        break;
      }
    }
    if (foundY === null) {
      foundY = it.y;
      rowsByY.set(foundY, []);
    }
    rowsByY.get(foundY)!.push(it);
  }

  const holdings: BrokerHolding[] = [];

  for (const rowItems of rowsByY.values()) {
    rowItems.sort((a, b) => a.x - b.x);

    const pickCol = (targetX: number, maxDist = 60) => {
      let closest: PdfTextItem | null = null;
      let minD = Infinity;
      for (const item of rowItems) {
        const d = Math.abs(item.x - targetX);
        if (d < minD && d < maxDist) {
          minD = d;
          closest = item;
        }
      }
      return closest;
    };

    const valueItem = pickCol(headerXs.value);
    if (!valueItem) continue;
    const value = parseNum(valueItem.str);
    if (value == null) continue;

    const qtyItem = pickCol(headerXs.quantity);
    const priceItem = pickCol(headerXs.price);
    const pctItem = pickCol(headerXs.pct);

    let nameStr = "";
    const nameItem = pickCol(headerXs.name, 150); 
    if (nameItem) {
      const nameItems = rowItems.filter(i => i.x > (headerXs.quantity + 40));
      nameStr = nameItems.map(i => i.str).join(" ").trim();
    } else {
      nameStr = rowItems[rowItems.length - 1].str.trim();
    }
    
    if (!nameStr) continue;

    const cashName = canonicalCashName(nameStr);
    const finalName = cashName || nameStr;
    const kind = guessKind(finalName);
    
    holdings.push({
      securityNumber: "",
      name: finalName,
      symbol: kind === "cash" ? "" : guessSymbol(finalName) || finalName.split(" ")[0],
      assetKind: kind,
      quantity: qtyItem ? (parseNum(qtyItem.str) || 0) : 0,
      priceCurrent: priceItem ? (parseNum(priceItem.str) || 0) : 0,
      valueIls: value,
      costIls: 0,
      pctOfPortfolio: pctItem ? (parseNum(pctItem.str) || 0) : 0,
    });
  }

  if (holdings.length < 2) return null;

  const sum = holdings.reduce((s, h) => s + h.valueIls, 0);
  if (Math.abs(sum - totalValue) / totalValue > 0.02) return null;

  const mEmail = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);

  return {
    broker: "Blink",
    accountNumber: mEmail ? mEmail[1] : "",
    reportDate: detectBlinkReportDate(text),
    currency: text.includes("דולר") ? "USD" : "ILS",
    totalValueIls: totalValue,
    holdings,
    transactions: parseBlinkTransactions(text),
    warnings: [],
  };
}

export function tryDeterministicParse(extracted: ExtractedPdf): BrokerReport | null {
  const blink = tryBlinkParse(extracted);
  if (blink) return blink;

  // Holdings live on page 1.
  const raw = extracted.items.filter((it) => it.page === 1 || it.page === undefined);
  if (raw.length === 0) return null;

  // ── 1. Strip the shadow text layer ──
  const items = raw.filter(
    (o) =>
      !raw.some(
        (t) =>
          t.str === o.str &&
          Math.abs(t.x - (o.x - SHADOW_DX)) < 3 &&
          Math.abs(t.y - (o.y + SHADOW_DY)) < 3
      )
  );

  // ── Header column centers + total row ──
  const headerXs: Partial<Record<keyof typeof HEADER_TOKENS, number>> = {};
  let headerY: number | null = null;
  let totalY: number | null = null;
  for (const it of items) {
    const s = it.str.replace(/\s+/g, " ").trim();
    for (const [key, token] of Object.entries(HEADER_TOKENS) as [keyof typeof HEADER_TOKENS, string][]) {
      if (headerXs[key] == null && s.includes(token)) {
        headerXs[key] = it.x;
        if (headerY == null) headerY = it.y;
      }
    }
    if (totalY == null && (s.includes('סה"כ') || s.includes("סה״כ"))) totalY = it.y;
  }
  // Note: the "אחוז" (pct) header renders as separate glyphs and won't match
  // as a token — pct is derived positionally from the value column instead.
  if (headerY == null || totalY == null || headerXs.value == null || headerXs.securityNumber == null) {
    return null; // not this layout → caller uses AI
  }

  // Grand total = largest number on the סה"כ row.
  const totalValue =
    items
      .filter((it) => Math.abs(it.y - totalY!) <= 4)
      .map((it) => parseNum(it.str))
      .filter((v): v is number => v != null)
      .reduce((mx, v) => Math.max(mx, v), 0) || 0;
  if (totalValue <= 0) return null;

  // Column x-bands, centered on the detected header positions.
  const band = (center: number, halfL: number, halfR: number): [number, number] => [
    center - halfL,
    center + halfR,
  ];
  const secMinX = headerXs.securityNumber - 12;
  const quantityBand = band(headerXs.quantity ?? 319, 41, 29);
  const valueX = headerXs.value;
  const bands = {
    // pct is the leftmost column, just left of value (no usable header glyph).
    pct: [Math.max(0, valueX - 86), valueX - 14] as [number, number],
    value: band(valueX, 14, 40),
    cost: band(headerXs.cost ?? 165, 27, 33),
    price: band(headerXs.price ?? 241, 36, 27),
    quantity: quantityBand,
    // Names sit between the quantity column and the security-number column.
    name: [quantityBand[1], secMinX] as [number, number],
  };

  const inBand = (x: number, b: [number, number]) => x >= b[0] && x < b[1];
  // Numeric cell on the anchor's baseline (nearest y) within a band.
  const pickNum = (ay: number, b: [number, number]): number | null => {
    const c = items
      .filter((o) => inBand(o.x, b) && Math.abs(o.y - ay) <= 4 && parseNum(o.str) != null)
      .sort((a, z) => Math.abs(a.y - ay) - Math.abs(z.y - ay));
    return c.length ? parseNum(c[0].str) : null;
  };
  // Name shares the anchor baseline EXACTLY; the parallel stream sits ~1pt off.
  const pickName = (ay: number): string => {
    let c = items.filter((o) => inBand(o.x, bands.name) && Math.abs(o.y - ay) < 0.6);
    if (!c.length) c = items.filter((o) => inBand(o.x, bands.name) && Math.abs(o.y - ay) <= 4);
    return c
      .sort((a, z) => a.x - z.x)
      .map((o) => o.str)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  };

  // ── 2+3. Anchor on canonical security numbers, read each row by baseline ──
  const anchors = items
    .filter(
      (o) =>
        /^\d{6,8}$/.test(o.str.trim()) &&
        o.x >= secMinX &&
        o.y < headerY! - 3 &&
        o.y > totalY! + 2
    )
    .sort((a, z) => z.y - a.y);

  const holdings: BrokerHolding[] = [];
  for (const a of anchors) {
    const value = pickNum(a.y, bands.value);
    if (value == null) continue;
    const rawName = pickName(a.y)
      .replace(/([֐-׿.])([A-Za-z])/g, "$1 $2")
      .replace(/([A-Za-z])([֐-׿])/g, "$1 $2")
      .trim();
    const kind = guessKind(rawName);
    // Hebrew names arrive reversed/garbled; for the standard cash rows use a
    // clean canonical label instead of the scrambled glyph order.
    const cashName = canonicalCashName(rawName);
    const name = cashName || rawName || a.str.trim();
    holdings.push({
      securityNumber: a.str.trim(),
      name,
      symbol: kind === "cash" ? "" : guessSymbol(rawName),
      assetKind: kind,
      quantity: pickNum(a.y, bands.quantity) ?? 0,
      priceCurrent: pickNum(a.y, bands.price) ?? 0,
      valueIls: value,
      costIls: pickNum(a.y, bands.cost) ?? 0,
      pctOfPortfolio: pickNum(a.y, bands.pct) ?? 0,
    });
  }

  // ── 2b. Balance rows WITHOUT a security number (e.g. יתרה כספית) ──
  // Value-column numbers whose baseline isn't owned by an anchored row AND
  // whose name resolves to a known balance label. Filtering on the cash label
  // (not just proximity) prevents the parallel data stream — which sits ~1pt
  // away — from claiming the slot.
  const anchorYs = anchors.map((a) => a.y);
  const addedYs: number[] = [];
  for (const o of items.slice().sort((a, z) => z.y - a.y)) {
    if (!inBand(o.x, bands.value) || parseNum(o.str) == null) continue;
    if (o.y >= headerY - 3 || o.y <= totalY + 2) continue;
    if (anchorYs.some((ay) => Math.abs(ay - o.y) <= 4)) continue;
    if (addedYs.some((y) => Math.abs(y - o.y) <= 3)) continue;
    const cashName = canonicalCashName(pickName(o.y));
    if (!cashName) continue;
    const value = pickNum(o.y, bands.value);
    if (value == null) continue;
    addedYs.push(o.y);
    // Pure balance line — only value/pct are meaningful; qty/price/cost columns
    // here belong to the adjacent stream, so don't read them.
    holdings.push({
      securityNumber: "",
      name: cashName,
      symbol: "",
      assetKind: "cash",
      quantity: 0,
      priceCurrent: 0,
      valueIls: value,
      costIls: 0,
      pctOfPortfolio: pickNum(o.y, bands.pct) ?? 0,
    });
  }

  if (holdings.length < 2) return null;

  // ── 4. Reconciliation guard ──
  const sum = holdings.reduce((s, h) => s + h.valueIls, 0);
  if (Math.abs(sum - totalValue) / totalValue > 0.02) return null;

  return {
    broker: detectBroker(extracted.text),
    accountNumber: detectAccountNumber(extracted.text),
    reportDate: detectReportDate(extracted.text),
    currency: "ILS",
    totalValueIls: totalValue,
    holdings,
    transactions: [],
    warnings: [],
  };
}

function detectBroker(text: string): string {
  const head = text.slice(0, 800);
  const candidates = [
    "אקסלנס",
    "מיטב",
    "פסגות",
    "אלטשולר",
    "ילין לפידות",
    "הראל",
    "כלל",
    "מנורה",
    "אנליסט",
    "מור",
  ];
  for (const c of candidates) if (head.includes(c)) return c;
  // The broker logo renders as letter-spaced text ("I B I"); collapse spaces
  // across the whole doc and check both directions (Hebrew prose is reversed).
  const collapsed = text.replace(/\s+/g, "");
  const reversed = collapsed.split("").reverse().join("");
  if (/IBI|אי\.?בי\.?אי/.test(collapsed) || /IBI|אי\.?בי\.?אי/.test(reversed)) return "IBI";
  return "בית השקעות";
}

function detectAccountNumber(text: string): string {
  const m = text.match(/לחשבון מס['׳]?\s*:?\s*(\d{4,})/);
  return m ? m[1] : "";
}

function detectReportDate(text: string): string {
  // Digits in these templates can be space-separated / RTL-wrapped; collapse
  // whitespace, then take the LATEST DD/MM/YYYY or DD.MM.YYYY present (the
  // "as of" date — statements also print older value dates we don't want).
  const t = text.replace(/\s+/g, "");
  const dates = [...t.matchAll(/(\d{2})[/.-](\d{2})[/.-](\d{2,4})/g)]
    .map((m) => {
      let y = +m[3];
      if (y > 0 && y < 100) y += 2000;
      return { d: +m[1], mo: +m[2], y };
    })
    .filter((x) => x.y >= 2000 && x.y <= 2100 && x.mo >= 1 && x.mo <= 12 && x.d >= 1 && x.d <= 31)
    .map((x) => ({
      iso: `${x.y}-${String(x.mo).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`,
      t: Date.UTC(x.y, x.mo - 1, x.d),
    }));
  if (dates.length === 0) return "";
  // The "as of" date is the latest date that isn't in the future — statements
  // also print future "valid until" dates we must not pick. (+1d slack.)
  const cutoff = Date.now() + 86_400_000;
  const past = dates.filter((d) => d.t <= cutoff);
  return (past.length ? past : dates).sort((a, b) => b.t - a.t)[0].iso;
}

/* ─────────────────────────────────────────────────────────────
   Stage 3 — Claude structured extraction (fallback)
   ───────────────────────────────────────────────────────────── */

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    broker: {
      type: "string",
      description: 'Investment house name (e.g. "מיטב", "אקסלנס"). "לא זוהה" if unclear.',
    },
    accountNumber: { type: "string", description: "Account number (מספר חשבון). Empty if absent." },
    reportDate: {
      type: "string",
      description:
        'Statement "as of" date in ISO YYYY-MM-DD (the מצב חשבונך ליום date). Empty if unresolvable.',
    },
    currency: { type: "string", description: 'Portfolio base currency, usually "ILS".' },
    totalValueIls: {
      type: "number",
      description: "Grand total portfolio value in ILS (the סה\"כ row).",
    },
    holdings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          securityNumber: { type: "string" },
          name: { type: "string" },
          symbol: {
            type: "string",
            description:
              'Ticker for market sync, uppercase. Extract from names like "NVIDIA(NVDA)" → "NVDA", "INVESCO (QQQ)" → "QQQ". Empty if none.',
          },
          assetKind: {
            type: "string",
            enum: ["stock", "etf", "crypto", "bond", "fund", "cash"],
            description:
              'Classify: single companies (INTEL, NVIDIA, GAP, ALIBABA) = stock; index/sector trackers (SP 500, NSDQ100, QQQ) = etf; crypto trusts/ETFs (GRAYSCALE ETHE, EZBC, BTC) = crypto; mutual funds = fund; bonds = bond; currency/cash balances (דולר ארה"ב, יתרה כספית, מגן מס) = cash.',
          },
          quantity: { type: "number" },
          priceCurrent: { type: "number", description: "שער נוכחי — current quote as printed." },
          valueIls: { type: "number", description: "שווי נייר בשקלים — total ILS value." },
          costIls: { type: "number", description: "עלות רכישה — total ILS purchase cost." },
          pctOfPortfolio: { type: "number", description: "אחוז מהתיק." },
        },
        required: [
          "securityNumber",
          "name",
          "symbol",
          "assetKind",
          "quantity",
          "priceCurrent",
          "valueIls",
          "costIls",
          "pctOfPortfolio",
        ],
        additionalProperties: false,
      },
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "ISO YYYY-MM-DD; empty if unresolvable." },
          type: { type: "string", description: "Operation in Hebrew (קניה/מכירה/הפקדה/דיבידנד…)." },
          name: { type: "string" },
          quantity: { type: "number" },
          amount: { type: "number", description: "Charge (+) / credit (−). 0 if not shown." },
        },
        required: ["date", "type", "name", "quantity", "amount"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["broker", "accountNumber", "reportDate", "currency", "totalValueIls", "holdings", "transactions"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are extracting a structured securities portfolio from the text layer of an
Israeli investment-house account statement.

The text was reconstructed from a PDF. Hebrew prose lines are reversed and
letter-spaced — IGNORE the paragraphs of disclaimers/legal text. Focus only on
the two data tables:

  • "פירוט יתרות" (holdings) — columns, right-to-left:
       מספר נייר | שם נייר | כמות | שער נוכחי | עלות רכישה | שווי נייר בשקלים | אחוז מהתיק
    The text layer may be doubled (a shadow copy) and the security NAME, NUMBER
    and the numeric columns can land on slightly different baselines. Use the
    security number, the % column, and the running totals to align each
    holding's numbers with its name. The final "סה\"כ" row is the portfolio
    grand total (in ILS) — put it in totalValueIls, NOT in holdings.

  • "פירוט תנועות בחשבון" (transactions) — date, operation type, name, quantity,
    amounts. Include every transaction row you can resolve.

Rules:
- Numbers use thousands separators (17,448.00). Parse them as plain numbers.
- valueIls and costIls are TOTALS for the holding (already in ILS), not per-unit.
- Do not invent holdings. If a value is genuinely unreadable, add a warning
  rather than guessing.
- Currency/cash rows (דולר ארה"ב, יתרה כספית/כספית, מגן מס) are real holdings —
  include them with assetKind "cash".
- If the document is not an investment statement, return empty holdings with a
  warning explaining what you saw.`;

export async function analyzeBrokerReport(text: string, filename: string): Promise<BrokerReport> {
  if (!getAnthropicKey()) {
    return errorReport("ניתוח לא זמין — מפתח Anthropic חסר בסביבת השרת");
  }
  const client = createAnthropicClient();
  if (!client) return errorReport("ניתוח לא זמין — מפתח Anthropic חסר בסביבת השרת");

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the portfolio from this statement (${filename}):\n\n${text}`,
            },
          ],
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: REPORT_SCHEMA as Record<string, unknown> },
      },
    });

    const parsed = response.parsed_output as unknown as BrokerReport | null;
    if (!parsed || !Array.isArray(parsed.holdings)) {
      return errorReport("Claude זיהה את הקובץ אבל הפלט לא תאם את הסכמה הצפויה — נסה שוב");
    }

    return {
      broker: parsed.broker || "לא זוהה",
      accountNumber: parsed.accountNumber || "",
      reportDate: parsed.reportDate || "",
      currency: parsed.currency || "ILS",
      totalValueIls: parsed.totalValueIls || 0,
      holdings: parsed.holdings,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return errorReport("השרת תפוס כרגע — נסה שוב בעוד דקה");
    if (err instanceof Anthropic.AuthenticationError) return errorReport("בעיית הרשאות API — פנה למנהל המערכת");
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[broker-pdf-parser] analyze failed:", reason);
    return errorReport(`כשל בניתוח הדוח: ${reason.slice(0, 120)}`);
  }
}

/**
 * Extract just the transactions from a PDF text. Used as a fallback when the
 * deterministic parser found holdings but no transactions.
 */
export async function extractTransactionsAi(text: string): Promise<BrokerTransaction[]> {
  const client = createAnthropicClient();
  if (!client) return [];

  const TRANSACTIONS_SCHEMA = {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "ISO YYYY-MM-DD; empty if unresolvable." },
            type: { type: "string", description: "Operation in Hebrew (קניה/מכירה/הפקדה/דיבידנד…)." },
            name: { type: "string" },
            quantity: { type: "number" },
            amount: { type: "number", description: "Charge (+) / credit (−). 0 if not shown." },
          },
          required: ["date", "type", "name", "quantity", "amount"],
          additionalProperties: false,
        },
      },
    },
    required: ["transactions"],
    additionalProperties: false,
  } as const;

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: `Extract all transactions (פירוט תנועות בחשבון) from this account statement text.
Include every transaction row you can resolve: date, operation type (קניה, מכירה, הפקדה, דיבידנד, etc.),
security name, quantity, and amounts. Include deposits (הפקדה) and withdrawals (משיכה) as well.
The text layer may be scrambled; do your best to reconstruct each transaction.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract transactions from this statement:\n\n${text}`,
            },
          ],
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: TRANSACTIONS_SCHEMA as Record<string, unknown> },
      },
    });

    const parsed = response.parsed_output as unknown as { transactions?: BrokerTransaction[] } | null;
    return Array.isArray(parsed?.transactions) ? parsed.transactions : [];
  } catch {
    return [];
  }
}

function errorReport(warning: string): BrokerReport {
  return {
    broker: "לא זוהה",
    accountNumber: "",
    reportDate: "",
    currency: "ILS",
    totalValueIls: 0,
    holdings: [],
    transactions: [],
    warnings: [warning],
  };
}
