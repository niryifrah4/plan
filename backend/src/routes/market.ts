import { Router } from "express";
import { env } from "../env.js";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

/**
 * /api/market/prices — ported from app/api/market/prices. Server-side proxy
 * for Yahoo Finance + CoinGecko (avoids browser CORS).
 *
 * Migration note: GET requires an authenticated user (the SPA sends a token);
 * POST is the scheduled-refresh hook, gated by x-vercel-cron / CRON_SECRET
 * (no user auth) — currently a stub, kept green for the cron.
 *
 * Also hosts the main GET /api/market kind-switch proxy (quote/quotes/fx/
 * fx-date/macro/crypto) — ported verbatim from app/api/market/route.ts.
 */
export const marketRouter = Router();

/* ─── /api/market kind-switch proxy (Yahoo / BoI / CoinGecko / CBS) ─── */

const KIND_SYMBOL_RE = /^[A-Z0-9.^=-]{1,16}$/;
const COIN_ID_RE = /^[a-z0-9-]{1,40}$/;
const CACHE_TTL_MS = 10 * 60 * 1000;
type CacheEntry = { value: unknown; expiresAt: number };
const cache: Map<string, CacheEntry> = new Map();

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T);
  return fetcher().then((v) => {
    cache.set(key, { value: v, expiresAt: Date.now() + CACHE_TTL_MS });
    return v;
  });
}

interface YahooMeta {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  currency?: string;
  shortName?: string;
}

async function fetchYahooQuote(symbol: string) {
  const sym = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)" } });
  if (!res.ok) return null;
  const data = await res.json();
  const meta: YahooMeta | undefined = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? price;
  return {
    symbol: meta.symbol ?? sym,
    price,
    currency: meta.currency ?? "USD",
    name: meta.shortName ?? sym,
    changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
  };
}

async function fetchYahooBulk(symbols: string[]) {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  const out: Record<string, NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>> = {};
  const concurrency = 5;
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((s) => fetchYahooQuote(s).catch(() => null)));
    results.forEach((r, idx) => {
      if (r) out[batch[idx]] = r;
    });
  }
  return out;
}

async function fetchBoiFX() {
  const tickers: Array<"USD" | "EUR" | "GBP"> = ["USD", "EUR", "GBP"];
  const results = await Promise.all(
    tickers.map(async (cur) => {
      try {
        const res = await fetch(`https://boi.org.il/PublicApi/GetExchangeRate?key=${cur}`, {
          headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
        });
        if (!res.ok) return [cur, null] as const;
        const data = await res.json();
        const rate = data?.currentExchangeRate;
        return [cur, typeof rate === "number" && rate > 0 ? rate : null] as const;
      } catch {
        return [cur, null] as const;
      }
    })
  );
  const out: Record<string, number> = { ILS: 1 };
  for (const [cur, rate] of results) if (rate) out[cur] = rate;
  return out;
}

async function fetchLiveFX() {
  const pairs: Record<"USD" | "EUR" | "GBP", string> = { USD: "USDILS=X", EUR: "EURILS=X", GBP: "GBPILS=X" };
  const boiFallback = await fetchBoiFX();
  const results = await Promise.all(
    (Object.entries(pairs) as Array<["USD" | "EUR" | "GBP", string]>).map(async ([cur, symbol]) => {
      try {
        const quote = await fetchYahooQuote(symbol);
        const rate = quote?.price;
        return [cur, typeof rate === "number" && rate > 0 ? rate : boiFallback[cur]] as const;
      } catch {
        return [cur, boiFallback[cur]] as const;
      }
    })
  );
  const out: Record<string, number> = { ILS: 1 };
  for (const [cur, rate] of results) if (rate) out[cur] = rate;
  return out;
}

async function fetchHistoricalFX(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid_date");
  const currencies: Array<"USD" | "EUR" | "GBP"> = ["USD", "EUR", "GBP"];
  const results = await Promise.all(
    currencies.map(async (cur) => {
      const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=${cur}&symbols=ILS`, {
        headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
      });
      if (!res.ok) return [cur, null] as const;
      const data = await res.json();
      const rate = data?.rates?.ILS;
      return [cur, typeof rate === "number" && rate > 0 ? rate : null] as const;
    })
  );
  const liveFallback = await fetchLiveFX();
  const out: Record<string, number> = { ILS: 1 };
  for (const [cur, rate] of results) out[cur] = rate ?? liveFallback[cur] ?? 0;
  return { date, rates: out };
}

const MACRO_FALLBACK = { boiRate: 0.0425, inflationRate: 0.025 };

interface MacroSnapshot {
  boiRate: number;
  primeRate: number;
  inflationRate: number;
  usd: number | null;
  updatedAt: string;
  source: { boiRate: "live" | "fallback"; inflation: "live" | "fallback"; usd: "live" | "fallback" };
}

async function fetchBoiInterestRate(): Promise<number | null> {
  try {
    const res = await fetch("https://www.boi.org.il/PublicApi/GetInterest", {
      headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pct = typeof data?.currentInterest === "number" ? data.currentInterest : null;
    if (pct == null || pct < 0 || pct > 30) return null;
    return pct / 100;
  } catch {
    return null;
  }
}

async function fetchCbsInflation(): Promise<number | null> {
  try {
    const res = await fetch("https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false", {
      headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const months = data?.month || data?.months;
    if (!Array.isArray(months) || months.length === 0) return null;
    const latest = months[months.length - 1];
    const yoyPct =
      typeof latest?.currPer_lastYearPercentageChange === "number" ? latest.currPer_lastYearPercentageChange : null;
    if (yoyPct == null || yoyPct < -10 || yoyPct > 50) return null;
    return yoyPct / 100;
  } catch {
    return null;
  }
}

async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const [boiRateLive, inflationLive, fx] = await Promise.all([
    fetchBoiInterestRate(),
    fetchCbsInflation(),
    fetchBoiFX(),
  ]);
  const boiRate = boiRateLive ?? MACRO_FALLBACK.boiRate;
  const inflationRate = inflationLive ?? MACRO_FALLBACK.inflationRate;
  const usd = fx.USD ?? null;
  return {
    boiRate,
    primeRate: boiRate + 0.015,
    inflationRate,
    usd,
    updatedAt: new Date().toISOString(),
    source: {
      boiRate: boiRateLive != null ? "live" : "fallback",
      inflation: inflationLive != null ? "live" : "fallback",
      usd: usd != null ? "live" : "fallback",
    },
  };
}

async function fetchCryptoBulk(coinIds: string[]) {
  const ids = coinIds.map((s) => s.trim().toLowerCase()).filter(Boolean).join(",");
  if (!ids) return [];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=ils,usd&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as Record<string, { ils?: number; usd_24h_change?: number }>;
  return coinIds
    .filter((id) => data[id.toLowerCase()] && typeof data[id.toLowerCase()].ils === "number")
    .map((id) => ({
      symbol: id.toLowerCase(),
      price: data[id.toLowerCase()].ils as number,
      currency: "ILS",
      changePct: data[id.toLowerCase()].usd_24h_change ?? 0,
    }));
}

interface QuoteResult {
  symbol: string;
  price: number | null;
  currency?: string;
  source: "yahoo" | "coingecko" | "cache" | "error";
  error?: string;
}

async function fetchYahoo(symbol: string): Promise<QuoteResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)", Accept: "application/json" },
    });
    if (!res.ok) return { symbol, price: null, source: "error", error: `HTTP ${res.status}` };
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data?.chart?.result?.[0]?.meta?.currency;
    if (typeof price !== "number") return { symbol, price: null, source: "error", error: "no price in response" };
    return { symbol, price, currency, source: "yahoo" };
  } catch (e) {
    return { symbol, price: null, source: "error", error: e instanceof Error ? e.message : "fetch failed" };
  }
}

async function fetchCoinGecko(coinIds: string[]): Promise<Record<string, unknown>> {
  if (!coinIds.length) return {};
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd,ils`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// GET /api/market?kind=quote|quotes|fx|fx-date|macro|crypto
marketRouter.get(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    const kind = String(req.query.kind || "");
    try {
      if (kind === "quote") {
        const sym = String(req.query.symbol || "").trim().toUpperCase();
        if (!sym) return res.status(400).json({ error: "missing symbol" });
        if (!KIND_SYMBOL_RE.test(sym)) return res.status(400).json({ error: "invalid symbol" });
        const data = await cached(`q:${sym}`, () => fetchYahooQuote(sym));
        return res.json(data ?? null);
      }
      if (kind === "quotes") {
        const symbols = String(req.query.symbols || "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => KIND_SYMBOL_RE.test(s));
        if (symbols.length === 0) return res.json({});
        const capped = symbols.slice(0, 50);
        const key = `qs:${[...capped].sort().join(",")}`;
        const data = await cached(key, () => fetchYahooBulk(capped));
        return res.json(data);
      }
      if (kind === "fx") {
        return res.json(await fetchLiveFX());
      }
      if (kind === "fx-date") {
        const date = String(req.query.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
        const data = await cached(`fx-date:${date}`, () => fetchHistoricalFX(date));
        return res.json(data);
      }
      if (kind === "macro") {
        const data = await cached("macro", () => fetchMacroSnapshot());
        return res.json(data);
      }
      if (kind === "crypto") {
        const ids = String(req.query.ids || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => COIN_ID_RE.test(s))
          .slice(0, 30);
        if (ids.length === 0) return res.json([]);
        const key = `c:${[...ids].sort().join(",")}`;
        const data = await cached(key, () => fetchCryptoBulk(ids));
        return res.json(data);
      }
      return res.status(400).json({ error: "unknown kind" });
    } catch (err) {
      console.error("[/api/market] error:", err);
      return res.status(500).json({ error: "fetch_failed" });
    }
  })
);

const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
const CRYPTO_RE = /^[a-z0-9-]{1,40}$/;
const MAX_SYMBOLS = 50;
const MAX_CRYPTOS = 30;

// GET /api/market/prices?symbols=AAPL,MSFT&crypto=bitcoin
marketRouter.get(
  "/prices",
  requireUser,
  asyncHandler(async (req, res) => {
    const symbols = String(req.query.symbols || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => SYMBOL_RE.test(s))
      .slice(0, MAX_SYMBOLS);
    const cryptoIds = String(req.query.crypto || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => CRYPTO_RE.test(s))
      .slice(0, MAX_CRYPTOS);

    if (symbols.length === 0 && cryptoIds.length === 0) {
      res.status(400).json({ error: "missing or invalid symbols/crypto param" });
      return;
    }

    const yahooResults: QuoteResult[] = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const batch = symbols.slice(i, i + 4);
      const r = await Promise.all(batch.map(fetchYahoo));
      yahooResults.push(...r);
    }
    const cryptoMap = await fetchCoinGecko(cryptoIds);

    res.json({ quotes: yahooResults, crypto: cryptoMap, fetchedAt: new Date().toISOString() });
  })
);

// POST /api/market/prices — scheduled refresh (cron). Stub; kept green.
marketRouter.post(
  "/prices",
  (req, res) => {
    const isCron = !!req.headers["x-vercel-cron"];
    const authHeader = req.headers.authorization || "";
    const cronSecret = process.env.CRON_SECRET;
    const hasSecret = cronSecret ? authHeader === `Bearer ${cronSecret}` : false;
    if (!isCron && !hasSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    void env;
    res.json({
      ok: true,
      scheduledAt: new Date().toISOString(),
      note: "stub — Supabase securities table pending; client refreshes on demand",
    });
  }
);
