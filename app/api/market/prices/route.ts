/**
 * /api/market/prices — server-side proxy for Yahoo Finance & CoinGecko.
 *
 * Two roles:
 *  1. Browser-callable price fetch (avoids CORS issues that block Yahoo
 *     directly from the client).
 *  2. Daily Vercel cron target — see `vercel.json`. The cron hits this
 *     endpoint with no symbols and we update Supabase price snapshots.
 *
 * Built 2026-04-28 per Nir: "המערכת חייבת להתעדכן אחת ליום".
 *
 * Auth model:
 *  - GET with `?symbols=AAPL,MSFT` → public (browser proxy, no PII).
 *  - POST without auth, called by Vercel cron → checked via
 *    `x-vercel-cron` header presence (Vercel sets this on cron requests).
 *    Manual triggers from outside should set `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)",
        "Accept": "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return { symbol, price: null, source: "error", error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data?.chart?.result?.[0]?.meta?.currency;
    if (typeof price !== "number") {
      return { symbol, price: null, source: "error", error: "no price in response" };
    }
    return { symbol, price, currency, source: "yahoo" };
  } catch (e: any) {
    return { symbol, price: null, source: "error", error: e?.message || "fetch failed" };
  }
}

async function fetchCoinGecko(coinIds: string[]): Promise<Record<string, number>> {
  if (!coinIds.length) return {};
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd,ils`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

/* ── GET — browser proxy ──
 * 2026-04-28 hardening (security audit):
 *  - require an authenticated Supabase session — proxy is for our users
 *    only, not a public service
 *  - cap at 50 symbols + 30 cryptos per request to prevent DoS
 *  - regex-validate symbols + crypto IDs to keep weird payloads out
 */
const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
const CRYPTO_RE = /^[a-z0-9-]{1,40}$/;
const MAX_SYMBOLS = 50;
const MAX_CRYPTOS = 30;

export async function GET(req: NextRequest) {
  // Auth gate — fail-closed when Supabase IS configured. Only the explicit
  // "no env vars set" case (local dev without Supabase) is allowed through.
  // 2026-04-29 hardening per security audit — previous version swallowed all
  // errors, which meant a misconfigured prod could degrade silently to public.
  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (supabaseConfigured) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    } catch (e: any) {
      // Configured but auth check threw — fail closed.
      return NextResponse.json({ error: "auth check failed", detail: e?.message || "unknown" }, { status: 500 });
    }
  }

  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols") || "";
  const cryptoParam = url.searchParams.get("crypto") || "";

  const symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean)
    .filter(s => SYMBOL_RE.test(s))
    .slice(0, MAX_SYMBOLS);
  const cryptoIds = cryptoParam.split(",").map(s => s.trim()).filter(Boolean)
    .filter(s => CRYPTO_RE.test(s))
    .slice(0, MAX_CRYPTOS);

  if (symbols.length === 0 && cryptoIds.length === 0) {
    return NextResponse.json({ error: "missing or invalid symbols/crypto param" }, { status: 400 });
  }

  // Fetch in parallel, with mild throttle (Yahoo blocks heavy parallel).
  const yahooResults: QuoteResult[] = [];
  for (let i = 0; i < symbols.length; i += 4) {
    const batch = symbols.slice(i, i + 4);
    const r = await Promise.all(batch.map(fetchYahoo));
    yahooResults.push(...r);
  }

  const cryptoMap = await fetchCoinGecko(cryptoIds);

  return NextResponse.json({
    quotes: yahooResults,
    crypto: cryptoMap,
    fetchedAt: new Date().toISOString(),
  });
}

/* ── POST — Vercel cron / scheduled refresh ──
 * Currently a no-op: the client-side localStorage doesn't persist on the
 * server, so daily refresh must be initiated by users. When Supabase
 * `securities` table comes online, this will fan out to all users and
 * refresh their snapshots. Returns 200 so the cron stays green. */
export async function POST(req: NextRequest) {
  const cronHeader = req.headers.get("x-vercel-cron");
  const auth = req.headers.get("authorization") || "";
  const isCron = !!cronHeader;
  const hasSecret = process.env.CRON_SECRET
    ? auth === `Bearer ${process.env.CRON_SECRET}`
    : false;

  if (!isCron && !hasSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // TODO (when Supabase securities table is live):
  //   const { data: rows } = await sb.from("securities").select("symbol, kind").eq("kind", "stock");
  //   for each row → fetchYahoo + upsert into price_snapshots
  return NextResponse.json({
    ok: true,
    scheduledAt: new Date().toISOString(),
    note: "stub — Supabase securities table pending; client refreshes on demand",
  });
}
