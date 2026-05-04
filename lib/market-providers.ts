/**
 * ═══════════════════════════════════════════════════════════
 *  Market Providers — CoinGecko + BOI FX + TASE Mapping
 * ═══════════════════════════════════════════════════════════
 *
 * 3 data providers in addition to Yahoo Finance (in market-sync.ts):
 * 1. CoinGecko — free crypto prices (bitcoin, ethereum, solana etc.)
 * 2. Bank of Israel — official FX rates (USD, EUR, GBP)
 * 3. TASE ticker mapping — Israeli stocks via Yahoo (.TA suffix)
 */

/* ── Types ── */

export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
  name?: string;
  changePct: number;
  source: "yahoo" | "coingecko" | "boi";
  lastUpdate: Date;
}

export interface FXRate {
  currency: string;
  rate: number; // 1 USD = X ILS
  lastUpdate: Date;
}

/* ── CoinGecko (free, no API key required) ── */

export async function fetchCryptoPrice(coinId: string): Promise<PriceQuote> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=ils,usd&include_24hr_change=true`
  );
  const data = await res.json();
  const coin = data[coinId];
  return {
    symbol: coinId,
    price: coin?.ils ?? 0,
    currency: "ILS",
    changePct: coin?.usd_24h_change ?? 0,
    source: "coingecko",
    lastUpdate: new Date(),
  };
}

export async function fetchCryptoPricesBulk(coinIds: string[]): Promise<PriceQuote[]> {
  const ids = coinIds.join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ils,usd&include_24hr_change=true`
  );
  const data = await res.json();
  return coinIds.map((id) => ({
    symbol: id,
    price: data[id]?.ils ?? 0,
    currency: "ILS",
    changePct: data[id]?.usd_24h_change ?? 0,
    source: "coingecko" as const,
    lastUpdate: new Date(),
  }));
}

/* ── Bank of Israel FX (free, no API key required) ── */

export async function fetchFXRate(currency: "USD" | "EUR" | "GBP"): Promise<FXRate> {
  const res = await fetch(`https://boi.org.il/PublicApi/GetExchangeRates?currencyCode=${currency}`);
  const data = await res.json();
  return {
    currency,
    rate: data?.currentExchangeRate ?? 0,
    lastUpdate: new Date(data?.lastUpdate ?? Date.now()),
  };
}

export async function fetchAllFXRates(): Promise<Record<string, number>> {
  const [usd, eur, gbp] = await Promise.all([
    fetchFXRate("USD"),
    fetchFXRate("EUR"),
    fetchFXRate("GBP"),
  ]);
  return { USD: usd.rate, EUR: eur.rate, GBP: gbp.rate, ILS: 1 };
}

/* ── TASE (Israeli stocks via Yahoo Finance ticker mapping) ── */

export function toYahooTicker(taseSymbol: string): string {
  if (taseSymbol.endsWith(".TA")) return taseSymbol;
  return `${taseSymbol}.TA`;
}
