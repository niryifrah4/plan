/**
 * /api/market — server-side proxy for market data providers.
 *
 * Browsers block direct calls to Yahoo Finance, Bank of Israel and (some-
 * times) CoinGecko due to CORS. This API route runs on the Next.js server
 * where CORS doesn't apply, fetches the data, and returns it to the client.
 *
 * Single endpoint, dispatched by `?kind=`:
 *   GET /api/market?kind=quote&symbol=AAPL
 *   GET /api/market?kind=quotes&symbols=AAPL,MSFT,VOO
 *   GET /api/market?kind=fx
 *   GET /api/market?kind=crypto&ids=bitcoin,ethereum
 *
 * Cached for 10 minutes per (kind,key) to be a polite citizen of these
 * free APIs.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tickers/coin-ids: alphanumeric with `.^=-` (e.g. AAPL, ^GSPC, BTC-USD), max 16 chars. */
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,16}$/;
const COIN_ID_RE = /^[a-z0-9-]{1,40}$/;

const CACHE_TTL_MS = 10 * 60 * 1000;
type CacheEntry = { value: unknown; expiresAt: number };
const cache: Map<string, CacheEntry> = new Map();

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return Promise.resolve(hit.value as T);
  }
  return fetcher().then((v) => {
    cache.set(key, { value: v, expiresAt: Date.now() + CACHE_TTL_MS });
    return v;
  });
}

/* ─── Quote (Yahoo Finance public chart endpoint) ─── */

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
  const res = await fetch(url, {
    headers: {
      // Yahoo accepts requests with a regular UA; without it sometimes 403s
      "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)",
    },
    cache: "no-store",
  });
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
  // Yahoo accepts comma-separated symbols on a different endpoint
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  const out: Record<string, NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>> = {};
  // Concurrency 5 for politeness
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

/* ─── FX (Bank of Israel) ─── */

async function fetchBoiFX() {
  const tickers: Array<"USD" | "EUR" | "GBP"> = ["USD", "EUR", "GBP"];
  const results = await Promise.all(
    tickers.map(async (cur) => {
      try {
        const res = await fetch(
          `https://boi.org.il/PublicApi/GetExchangeRate?key=${cur}`,
          {
            cache: "no-store",
            headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
          }
        );
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
  for (const [cur, rate] of results) {
    if (rate) out[cur] = rate;
  }
  return out;
}

async function fetchLiveFX() {
  const pairs: Record<"USD" | "EUR" | "GBP", string> = {
    USD: "USDILS=X",
    EUR: "EURILS=X",
    GBP: "GBPILS=X",
  };
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
  for (const [cur, rate] of results) {
    if (rate) out[cur] = rate;
  }
  return out;
}

/* ─── Macro rates (BoI interest + inflation + USD) ─── */

/** Default fallback values used when an upstream fetch fails. Kept aligned
 *  with `lib/assumptions.ts` DEFAULT_ASSUMPTIONS so the UI never shows zeros
 *  if an API call times out. Update manually when BoI announces a change. */
const MACRO_FALLBACK = {
  boiRate: 0.0425, // 4.25% — post 2026-05-27 BoI cut of 0.25%
  inflationRate: 0.025, // 2.5% — CBS yoy inflation
};

interface MacroSnapshot {
  /** Bank of Israel base rate (decimal). */
  boiRate: number;
  /** Israeli prime = BoI + 1.5% (Israeli banking standard). */
  primeRate: number;
  /** Year-over-year inflation (decimal). */
  inflationRate: number;
  /** USD→ILS exchange rate. */
  usd: number | null;
  /** ISO timestamp when this snapshot was assembled. */
  updatedAt: string;
  /** Per-field source so the UI can show "live" vs "fallback". */
  source: {
    boiRate: "live" | "fallback";
    inflation: "live" | "fallback";
    usd: "live" | "fallback";
  };
}

async function fetchBoiInterestRate(): Promise<number | null> {
  // BoI publishes the current interest rate via a public JSON endpoint.
  // The endpoint occasionally moves; we try the most stable URL and fall
  // back gracefully without breaking the rest of the macro snapshot.
  try {
    const res = await fetch("https://www.boi.org.il/PublicApi/GetInterest", {
      cache: "no-store",
      headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // The endpoint returns { currentInterest: number } where currentInterest
    // is the percent (e.g. 4.5). Convert to decimal.
    const pct = typeof data?.currentInterest === "number" ? data.currentInterest : null;
    if (pct == null || pct < 0 || pct > 30) return null;
    return pct / 100;
  } catch {
    return null;
  }
}

async function fetchCbsInflation(): Promise<number | null> {
  // CBS publishes the consumer price index via a data endpoint. The
  // year-over-year change of the headline index is what people call "inflation".
  // Endpoint is finicky and occasionally restructured; gracefully degrade.
  try {
    const res = await fetch(
      "https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false",
      {
        cache: "no-store",
        headers: { "User-Agent": "PlanApp/1.0 (server-side)" },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // CBS structure: months[].currPer_lastYearPercentageChange
    const months = data?.month || data?.months;
    if (!Array.isArray(months) || months.length === 0) return null;
    const latest = months[months.length - 1];
    const yoyPct =
      typeof latest?.currPer_lastYearPercentageChange === "number"
        ? latest.currPer_lastYearPercentageChange
        : null;
    if (yoyPct == null || yoyPct < -10 || yoyPct > 50) return null;
    return yoyPct / 100;
  } catch {
    return null;
  }
}

async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  // Fetch all three concurrently. Any individual failure falls back gracefully.
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
    primeRate: boiRate + 0.015, // Israeli banking constant
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

/* ─── Crypto (CoinGecko) ─── */

async function fetchCryptoBulk(coinIds: string[]) {
  const ids = coinIds
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
  if (!ids) return [];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=ils,usd&include_24hr_change=true`;
  const res = await fetch(url, { cache: "no-store" });
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

/* ─── Route handler ─── */

export async function GET(req: NextRequest) {
  // Auth gate — without this anyone on the internet could use us as a free
  // proxy against Yahoo/BoI/CoinGecko and get our IP rate-limited or banned.
  // (CRITICAL fix 2026-04 — security review.)
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "";

  try {
    if (kind === "quote") {
      const sym = (searchParams.get("symbol") || "").trim().toUpperCase();
      if (!sym) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
      if (!SYMBOL_RE.test(sym))
        return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
      const data = await cached(`q:${sym}`, () => fetchYahooQuote(sym));
      return NextResponse.json(data ?? null);
    }
    if (kind === "quotes") {
      const symbolsRaw = searchParams.get("symbols") || "";
      const symbols = symbolsRaw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SYMBOL_RE.test(s));
      if (symbols.length === 0) return NextResponse.json({});
      // Cap batch size — prevents abuse / large fetches.
      const capped = symbols.slice(0, 50);
      const key = `qs:${[...capped].sort().join(",")}`;
      const data = await cached(key, () => fetchYahooBulk(capped));
      return NextResponse.json(data);
    }
    if (kind === "fx") {
      const data = await fetchLiveFX();
      return NextResponse.json(data);
    }
    if (kind === "macro") {
      // Macro updates slowly (BoI decides ~8 times/year, CPI monthly), so
      // a 60-minute cache is plenty. Reduces upstream load + dashboard
      // load time after the first hit.
      const data = await cached("macro", () => fetchMacroSnapshot());
      return NextResponse.json(data);
    }
    if (kind === "crypto") {
      const idsRaw = searchParams.get("ids") || "";
      const ids = idsRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => COIN_ID_RE.test(s))
        .slice(0, 30);
      if (ids.length === 0) return NextResponse.json([]);
      const key = `c:${[...ids].sort().join(",")}`;
      const data = await cached(key, () => fetchCryptoBulk(ids));
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  } catch (err) {
    console.error("[/api/market] error:", err);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
