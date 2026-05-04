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
          `https://boi.org.il/PublicApi/GetExchangeRates?currencyCode=${cur}`,
          {
            cache: "no-store",
          }
        );
        if (!res.ok) return [cur, null] as const;
        const data = await res.json();
        const rate = data?.currentExchangeRate;
        return [cur, typeof rate === "number" ? rate : null] as const;
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
  const supabase = createClient();
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
      const data = await cached("fx", () => fetchBoiFX());
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
