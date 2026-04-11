/**
 * Market Value Sync — Wealth Auto-Sync
 *
 * Keeps the portfolio's live prices in sync with public market data
 * (Yahoo Finance). Provides:
 *   • refreshAllPrices(securities) — batch price refresh for all tickers
 *   • computePerformance(...) — actual vs assumption delta
 *   • recordSnapshot / getSnapshots — history for return analysis
 */

export interface TickerQuote {
  symbol: string;
  price: number;
  currency: string;
  name: string;
  changePct: number;  // day change %
}

export interface PerformanceAnalysis {
  /** Actual return achieved over the last N days */
  actualPct: number;
  /** Expected return according to user assumptions (annualised, then pro-rated) */
  expectedPct: number;
  /** Delta (actual − expected) */
  deltaPct: number;
  /** Human summary in Hebrew */
  summary: string;
  /** Severity color */
  severity: "good" | "neutral" | "bad";
}

/** Fetch a single quote from Yahoo Finance's public chart endpoint */
export async function fetchQuote(symbol: string): Promise<TickerQuote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.trim().toUpperCase())}?interval=1d&range=5d`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice || 0;
    const prev = meta.previousClose || price;
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return {
      symbol: meta.symbol || symbol,
      price,
      currency: meta.currency || "USD",
      name: meta.shortName || meta.symbol || symbol,
      changePct,
    };
  } catch {
    return null;
  }
}

/** Fetch quotes for many tickers in parallel (with concurrency cap) */
export async function fetchQuotesBulk(symbols: string[]): Promise<Record<string, TickerQuote>> {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  const result: Record<string, TickerQuote> = {};
  const concurrency = 5;
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const quotes = await Promise.all(batch.map(s => fetchQuote(s)));
    quotes.forEach((q, idx) => {
      if (q) result[batch[idx].toUpperCase()] = q;
    });
  }
  return result;
}

/**
 * Compare actual realized return to the planned assumption rate.
 * @param actualValue  current market value of portfolio
 * @param costBasis    total cost basis
 * @param monthsElapsed how many months since the positions were opened
 * @param assumedAnnualRate e.g. 0.065 for 6.5%/yr
 */
export function computePerformance(
  actualValue: number,
  costBasis: number,
  monthsElapsed: number,
  assumedAnnualRate: number
): PerformanceAnalysis {
  if (costBasis <= 0 || monthsElapsed <= 0) {
    return {
      actualPct: 0,
      expectedPct: 0,
      deltaPct: 0,
      summary: "אין מספיק נתונים לחישוב ביצועים",
      severity: "neutral",
    };
  }
  const actualPct = ((actualValue - costBasis) / costBasis) * 100;
  // Expected return pro-rated to the elapsed period
  const years = monthsElapsed / 12;
  const expectedPct = (Math.pow(1 + assumedAnnualRate, years) - 1) * 100;
  const deltaPct = actualPct - expectedPct;

  let severity: PerformanceAnalysis["severity"] = "neutral";
  if (deltaPct > 1) severity = "good";
  else if (deltaPct < -1) severity = "bad";

  const sign = deltaPct >= 0 ? "+" : "";
  const summary =
    `התיק השיג ${actualPct.toFixed(1)}% ` +
    `(הנחת תכנון: ${expectedPct.toFixed(1)}%) · ` +
    `${sign}${deltaPct.toFixed(1)}% מול היעד`;

  return { actualPct, expectedPct, deltaPct, summary, severity };
}

// ─── Snapshot storage: keeps a daily net-worth trail for performance charting ───

interface Snapshot {
  date: string;       // ISO date
  totalValue: number;
}

const SNAPSHOT_KEY = "verdant:wealth_snapshots";

export function recordSnapshot(totalValue: number) {
  if (typeof window === "undefined") return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const snaps: Snapshot[] = raw ? JSON.parse(raw) : [];
    // Replace today's entry if exists
    const filtered = snaps.filter(s => s.date !== today);
    filtered.push({ date: today, totalValue });
    // Keep last 365 entries
    const trimmed = filtered.slice(-365);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function getSnapshots(): Snapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
