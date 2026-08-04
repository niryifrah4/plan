import { Router } from "express";
import * as XLSX from "xlsx";
import { requireUser } from "../middleware/auth.js";
import { isSafeXlsxContainer } from "../lib/safe-zip.js";
import { asyncHandler } from "../lib/async-handler.js";
import { upload } from "../lib/upload.js";

/**
 * POST /api/securities/parse-excel — ported from app/api/securities/parse-excel.
 * Self-contained portfolio parser (xlsx); formData("file") -> multer single.
 * All parsing helpers are copied verbatim from the original route.
 */
export const securitiesRouter = Router();

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/["'״׳()[\]_\-.\s]/g, "").trim();
}

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
  if (/^(BTC|ETH|SOL|DOGE)/i.test(symbol)) return "crypto";
  if (/^\d{4,}$/.test(symbol)) return "stock";
  return "stock";
}

async function fetchFxRates(): Promise<Record<string, number>> {
  const pairs: Record<string, string> = { USD: "USDILS=X", EUR: "EURILS=X", GBP: "GBPILS=X" };
  const out: Record<string, number> = { ILS: 1 };
  await Promise.all(
    Object.entries(pairs).map(async ([currency, symbol]) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)" } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof rate === "number" && rate > 0) out[currency] = rate;
      } catch {
        /* Missing FX leaves non-ILS rows unconverted rather than using a stale hard-code. */
      }
    })
  );
  return out;
}

function parseSheet(sheetName: string, rows: unknown[][], warnings: string[], fxRates: Record<string, number>): ParsedRow[] {
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

    const idN = norm(identifier);
    if (/^(סהכ|סךהכל|total|סיכום|גרנדטוטל|subtotal|מזומן|cash)$/.test(idN)) continue;

    const quantity = map.quantity !== undefined ? toNum(row[map.quantity]) : 0;
    const price = map.price !== undefined ? toNum(row[map.price]) : 0;
    const avgCost = map.avgCost !== undefined ? toNum(row[map.avgCost]) : 0;
    const marketValueRaw = map.marketValue !== undefined ? toNum(row[map.marketValue]) : 0;
    const currency =
      map.currency !== undefined
        ? guessCurrency(row[map.currency], row[map.price ?? -1], row[map.marketValue ?? -1])
        : guessCurrency("", row[map.price ?? -1], row[map.marketValue ?? -1]);
    const fx = fxRates[currency] ?? 0;
    const hasFx = currency === "ILS" || fx > 0;

    if (quantity <= 0 && marketValueRaw <= 0) continue;

    const currentPrice = price || (quantity > 0 && marketValueRaw > 0 && hasFx ? marketValueRaw / quantity / fx : 0);
    const marketValueILS = hasFx && marketValueRaw > 0 ? marketValueRaw : hasFx ? quantity * currentPrice * fx : 0;
    const costBasisILS = avgCost > 0 ? quantity * avgCost * fx : marketValueILS;
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

securitiesRouter.post(
  "/parse-excel",
  requireUser,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "לא הועלה קובץ", code: "NO_FILE" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      res.status(413).json({ error: "הקובץ גדול מדי (עד 10MB)", code: "FILE_TOO_LARGE" });
      return;
    }
    const name = file.originalname || "portfolio";
    if (!/\.(xlsx|xls|csv)$/i.test(name)) {
      res.status(400).json({ error: "רק קבצי Excel או CSV נתמכים", code: "INVALID_EXT" });
      return;
    }

    const buf = file.buffer;
    const isXlsx = /\.xlsx$/i.test(name);
    const isXls = /\.xls$/i.test(name) && !isXlsx;
    if (isXlsx && !(buf[0] === 0x50 && buf[1] === 0x4b)) {
      res.status(415).json({ error: "הקובץ אינו קובץ Excel תקין (.xlsx)", code: "BAD_MAGIC" });
      return;
    }
    if (isXlsx && !isSafeXlsxContainer(buf)) {
      res.status(415).json({ error: "קובץ Excel מורכב או דחוס מדי", code: "UNSAFE_XLSX" });
      return;
    }
    if (isXls && !(buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)) {
      res.status(415).json({ error: "הקובץ אינו קובץ Excel תקין (.xls)", code: "BAD_MAGIC" });
      return;
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `לא ניתן לפתוח את הקובץ: ${reason.slice(0, 100)}`, code: "CORRUPT_FILE" });
      return;
    }

    const warnings: string[] = [];
    const allRows: ParsedRow[] = [];
    let rawTextForBrokerDetect = name;
    const fxRates = await fetchFxRates();

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
      rawTextForBrokerDetect += " " + rows.slice(0, 10).flat().join(" ");
      const parsed = parseSheet(sheetName, rows as unknown[][], warnings, fxRates);
      allRows.push(...parsed);
    }

    const broker = detectBroker(rawTextForBrokerDetect);
    if (broker) allRows.forEach((r) => (r.broker = broker));
    const totalValue = allRows.reduce((s, r) => s + (r.market_value_ils || 0), 0);

    res.json({
      rows: allRows,
      warnings,
      stats: { rowCount: allRows.length, totalValue, sheetCount: wb.SheetNames.length },
      meta: { fileName: name, broker },
    });
  })
);
