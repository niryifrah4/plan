/**
 * POST /api/securities/parse-excel
 *
 * Accepts an investment portfolio file (xlsx / xls / csv) from Israeli
 * brokers (מיטב דש, אקסלנס, בנקים) or international ones (Interactive
 * Brokers, etc.) and returns a normalized list of SecurityRow-shaped
 * holdings the client can preview and merge.
 *
 * Strategy:
 * - Read every sheet with xlsx, to a 2D array.
 * - For each sheet, scan the first ~25 rows looking for a row that has
 *   enough "header-like" cells (שם נייר / סימבול / כמות / שער / שווי …).
 * - Map columns to canonical fields using fuzzy matching (Hebrew + English).
 * - Parse each data row into a SecurityRow; skip summary/total rows.
 * - Return { rows, warnings, stats, meta } so the UI can preview before merge.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

interface ParsedRow {
  symbol: string;
  name?: string;
  kind: string;
  broker: string | null;
  currency: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  fx_rate_to_ils: number;
  cost_basis_ils: number;
  market_value_ils: number;
  unrealized_pnl_ils: number;
  unrealized_pnl_pct: number;
  sourceRow: number;
  sourceSheet: string;
}

interface ColumnMap {
  symbol?: number;
  name?: number;
  quantity?: number;
  avgCost?: number;
  price?: number;
  marketValue?: number;
  currency?: number;
  costBasis?: number;
  pnl?: number;
  pnlPct?: number;
  kind?: number;
}

/** Lowercase + strip spaces/quotes/parens for loose comparison. */
function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/["'״׳()[\]_\-.\s]/g, "")
    .trim();
}

/** Synonyms — any cell whose normalized form INCLUDES one of these counts as that column. */
const SYNONYMS: Record<keyof ColumnMap, string[]> = {
  symbol: ["סימול", "סמל", "מספרנייר", "מסנייר", "מספרני", "ticker", "symbol", "isin"],
  name: ["שםנייר", "שםהנייר", "שםמוצר", "תיאור", "שם", "name", "description", "security"],
  quantity: ["כמות", "יחידות", "מספריחידות", "quantity", "qty", "units", "shares", "position"],
  avgCost: ["עלותממוצעת", "מחירקנייהממוצע", "עלותליחידה", "מחירעלות", "avgcost", "averagecost", "costbasis"],
  price: ["שער", "מחיר", "שערנוכחי", "שערסגירה", "price", "last", "marketprice", "currentprice", "close"],
  marketValue: ["שוויתיק", "שוויבשח", "שוויבשקל", "שוויבשקלים", "שוויכולל", "שוויני", "שווי", "marketvalue", "value", "totalvalue", "positionvalue"],
  currency: ["מטבע", "מטבעמסחר", "currency", "ccy"],
  costBasis: ["עלותכוללת", "עלותתיק", "totalcost", "costbasisils"],
  pnl: ["רוולהפסד", "רווחהפסד", "רוחה", "רוולה", "pnl", "unrealizedpnl", "gainloss", "profitloss"],
  pnlPct: ["רוול", "תשואה", "אחוזתשואה", "%", "pnl%", "return", "gainpct"],
  kind: ["סוג", "סוגנייר", "type", "assettype", "instrumenttype", "kind"],
};

function matchColumn(cell: string): keyof ColumnMap | null {
  if (!cell) return null;
  const n = norm(cell);
  if (!n) return null;
  // Rank by longest matching synonym to avoid "שווי" matching before "שווי שוק".
  let bestKey: keyof ColumnMap | null = null;
  let bestLen = 0;
  (Object.keys(SYNONYMS) as (keyof ColumnMap)[]).forEach((key) => {
    for (const syn of SYNONYMS[key]) {
      if (n.includes(syn) && syn.length > bestLen) {
        bestKey = key;
        bestLen = syn.length;
      }
    }
  });
  return bestKey;
}

/** Find a header row inside a 2D sheet by scoring candidate rows. */
function findHeaderRow(rows: unknown[][]): { idx: number; map: ColumnMap } | null {
  const limit = Math.min(rows.length, 30);
  let best: { idx: number; map: ColumnMap; score: number } | null = null;
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || [];
    const map: ColumnMap = {};
    let score = 0;
    row.forEach((cell, col) => {
      const key = matchColumn(String(cell ?? ""));
      if (key && map[key] === undefined) {
        map[key] = col;
        score += key === "symbol" || key === "name" || key === "quantity" || key === "marketValue" || key === "price" ? 2 : 1;
      }
    });
    // Need at least one identifier (symbol/name) + one numeric (quantity / marketValue / price)
    const hasId = map.symbol !== undefined || map.name !== undefined;
    const hasNum = map.quantity !== undefined || map.marketValue !== undefined || map.price !== undefined;
    if (hasId && hasNum && score > (best?.score ?? 0)) {
      best = { idx: i, map, score };
    }
  }
  return best ? { idx: best.idx, map: best.map } : null;
}

function toNum(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v == null) return 0;
  const s = String(v).replace(/[₪$,\s]/g, "").replace(/[()]/g, "-").trim();
  if (!s || s === "-") return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function guessCurrency(v: unknown, priceCell?: unknown, valueCell?: unknown): string {
  const s = String(v ?? "").toUpperCase().trim();
  if (/ILS|שקל|NIS|₪/i.test(s)) return "ILS";
  if (/USD|דולר|\$/i.test(s)) return "USD";
  if (/EUR|יורו|אירו|€/i.test(s)) return "EUR";
  if (/GBP|סטרלינ|£/i.test(s)) return "GBP";
  const combined = String(priceCell ?? "") + " " + String(valueCell ?? "");
  if (/\$/.test(combined)) return "USD";
  if (/€/.test(combined)) return "EUR";
  if (/£/.test(combined)) return "GBP";
  if (/₪/.test(combined)) return "ILS";
  return "ILS";
}

function guessKind(cell: unknown, symbol: string): string {
  const n = norm(cell);
  if (!n && !symbol) return "stock";
  if (/etf|סל|מחקה/.test(n)) return "etf";
  if (/bond|אגח|אגרתחוב/.test(n)) return "bond";
  if (/option|אופצ/.test(n)) return "option";
  if (/rsu/.test(n)) return "rsu";
  if (/crypto|ביטקו|מטבעוירטואל/.test(n)) return "crypto";
  if (/fund|קרןנאמנות|קרן/.test(n)) return "fund";
  // Heuristic on symbol
  if (/^(BTC|ETH|SOL|DOGE)/i.test(symbol)) return "crypto";
  if (/^\d{4,}$/.test(symbol)) return "stock"; // TASE numeric
  return "stock";
}

const FX_FALLBACK: Record<string, number> = { ILS: 1, USD: 3.7, EUR: 4.0, GBP: 4.7 };

function parseSheet(sheetName: string, rows: unknown[][], warnings: string[]): ParsedRow[] {
  const header = findHeaderRow(rows);
  if (!header) {
    warnings.push(`גיליון "${sheetName}": לא זוהתה שורת כותרות — דלג.`);
    return [];
  }
  const { idx: headerIdx, map } = header;
  const out: ParsedRow[] = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

    const rawSymbol = map.symbol !== undefined ? String(row[map.symbol] ?? "").trim() : "";
    const rawName = map.name !== undefined ? String(row[map.name] ?? "").trim() : "";
    const identifier = rawSymbol || rawName;
    if (!identifier) continue;

    // Skip obvious total/summary rows
    const idN = norm(identifier);
    if (/^(סהכ|סךהכל|total|סיכום|גרנדטוטל|subtotal|מזומן|cash)$/.test(idN)) continue;

    const quantity = map.quantity !== undefined ? toNum(row[map.quantity]) : 0;
    const price = map.price !== undefined ? toNum(row[map.price]) : 0;
    const avgCost = map.avgCost !== undefined ? toNum(row[map.avgCost]) : 0;
    const marketValueRaw = map.marketValue !== undefined ? toNum(row[map.marketValue]) : 0;
    const currency = map.currency !== undefined ? guessCurrency(row[map.currency], row[map.price ?? -1], row[map.marketValue ?? -1]) : guessCurrency("", row[map.price ?? -1], row[map.marketValue ?? -1]);
    const fx = FX_FALLBACK[currency] ?? 1;

    // Need at least quantity OR market value to be a real holding
    if (quantity <= 0 && marketValueRaw <= 0) continue;

    // Derive market value: prefer explicit column, else compute from qty*price
    const currentPrice = price || (quantity > 0 && marketValueRaw > 0 ? marketValueRaw / quantity / fx : 0);
    const marketValueILS = marketValueRaw > 0
      ? marketValueRaw
      : quantity * currentPrice * fx;
    const costBasisILS = avgCost > 0
      ? quantity * avgCost * fx
      : marketValueILS; // fallback: assume breakeven when cost unknown
    const pnlILS = marketValueILS - costBasisILS;
    const pnlPct = costBasisILS > 0 ? (pnlILS / costBasisILS) * 100 : 0;

    const kind = guessKind(map.kind !== undefined ? row[map.kind] : "", rawSymbol);

    out.push({
      symbol: rawSymbol || rawName.slice(0, 12),
      name: rawName || undefined,
      kind,
      broker: null,
      currency,
      quantity,
      avg_cost: avgCost || currentPrice,
      current_price: currentPrice,
      fx_rate_to_ils: fx,
      cost_basis_ils: costBasisILS,
      market_value_ils: marketValueILS,
      unrealized_pnl_ils: pnlILS,
      unrealized_pnl_pct: pnlPct,
      sourceRow: r + 1,
      sourceSheet: sheetName,
    });
  }

  if (out.length === 0) {
    warnings.push(`גיליון "${sheetName}": נמצאה שורת כותרות אך לא אותרו החזקות.`);
  }
  return out;
}

function detectBroker(text: string): string | null {
  const t = text.toLowerCase();
  if (/מיטב|meitav/i.test(text)) return "מיטב דש";
  if (/excellence|אקסלנס/i.test(text)) return "אקסלנס";
  if (/psagot|פסגות/i.test(text)) return "פסגות";
  if (/ibi|איביאי|אי\.בי\.אי/i.test(text)) return "IBI";
  if (/interactive ?brokers|ibkr/i.test(t)) return "Interactive Brokers";
  if (/לאומי|leumi/i.test(text)) return "בנק לאומי";
  if (/הפועלים|hapoalim|poalim/i.test(text)) return "בנק הפועלים";
  if (/discount|דיסקונט/i.test(text)) return "בנק דיסקונט";
  if (/mizrahi|מזרחי/i.test(text)) return "בנק מזרחי טפחות";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth guard ──
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא הועלה קובץ", code: "NO_FILE" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "הקובץ גדול מדי (עד 10MB)", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    const name = file.name || "portfolio";
    if (!/\.(xlsx|xls|csv)$/i.test(name)) {
      return NextResponse.json({ error: "רק קבצי Excel או CSV נתמכים", code: "INVALID_EXT" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `לא ניתן לפתוח את הקובץ: ${reason.slice(0, 100)}`, code: "CORRUPT_FILE" }, { status: 422 });
    }

    const warnings: string[] = [];
    const allRows: ParsedRow[] = [];
    let rawTextForBrokerDetect = name;

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
      rawTextForBrokerDetect += " " + rows.slice(0, 10).flat().join(" ");
      const parsed = parseSheet(sheetName, rows as unknown[][], warnings);
      allRows.push(...parsed);
    }

    const broker = detectBroker(rawTextForBrokerDetect);
    if (broker) allRows.forEach((r) => (r.broker = broker));

    const totalValue = allRows.reduce((s, r) => s + (r.market_value_ils || 0), 0);

    return NextResponse.json({
      rows: allRows,
      warnings,
      stats: {
        rowCount: allRows.length,
        totalValue,
        sheetCount: wb.SheetNames.length,
      },
      meta: {
        fileName: name,
        broker,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה בעיבוד הקובץ";
    return NextResponse.json({ error: message, code: "UNEXPECTED" }, { status: 500 });
  }
}
