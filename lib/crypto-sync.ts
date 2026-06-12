/**
 * ═══════════════════════════════════════════════════════════
 *  Crypto Sync — pulls exchange balances into portfolio positions
 * ═══════════════════════════════════════════════════════════
 *
 * Flow (Binance):
 *   1. POST /api/crypto/binance/balances with stored apiKey + secret
 *   2. Server-side: HMAC-sign and fetch /api/v3/account from Binance
 *   3. Receive non-zero balances → map asset codes to CoinGecko ids
 *   4. Fetch ILS prices via CoinGecko (existing market-providers)
 *   5. Upsert Position rows for this account; remove positions for
 *      assets that no longer appear in the balance
 *
 * Out of scope (deferred):
 *   • Coinbase (auth migrated to ECDSA JWT in 2024 — needs separate work)
 *   • Cost basis ingestion (Binance /account doesn't expose it)
 *   • Trade history
 */

import { fetchCryptoPricesBulk } from "./market-providers";
import {
  addPosition,
  deletePosition,
  loadPositions,
  updatePosition,
  type Position,
} from "./portfolio-store";
import { reportError } from "@/lib/report-error";

/* ─── Asset code → CoinGecko id mapping ────────────────────── */

// Top crypto assets by market cap. Anything not in this map is reported
// in the `skipped` list — the user can edit/add manually if needed.
const COINGECKO_BY_ASSET: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  TRX: "tron",
  MATIC: "matic-network",
  LINK: "chainlink",
  DOT: "polkadot",
  TON: "the-open-network",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  NEAR: "near",
  UNI: "uniswap",
  ATOM: "cosmos",
  XLM: "stellar",
  ETC: "ethereum-classic",
  XMR: "monero",
  HBAR: "hedera-hashgraph",
  FIL: "filecoin",
  ARB: "arbitrum",
  OP: "optimism",
  APT: "aptos",
  SUI: "sui",
  ALGO: "algorand",
  VET: "vechain",
  RNDR: "render-token",
  AAVE: "aave",
  MKR: "maker",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  GRT: "the-graph",
  IMX: "immutable-x",
  STX: "blockstack",
  INJ: "injective-protocol",
  FTM: "fantom",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  EOS: "eos",
  THETA: "theta-token",
  CRV: "curve-dao-token",
  CHZ: "chiliz",
  GALA: "gala",
  KAVA: "kava",
};

export interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface CryptoSyncResult {
  exchange: "binance";
  added: number;
  updated: number;
  removed: number;
  /** Asset codes we couldn't map to a price source. */
  skipped: string[];
  /** Total ILS value of the synced positions. */
  totalValueIls: number;
  /** ISO timestamp of the sync. */
  syncedAt: string;
}

/**
 * Pull balances from Binance and reconcile against existing Positions
 * in `accountId`. Returns counts of added/updated/removed rows.
 */
export async function syncBinance(
  apiKey: string,
  secret: string,
  accountId: string
): Promise<CryptoSyncResult> {
  // 1. Server proxy call
  const res = await fetch("/api/crypto/binance/balances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, secret }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail =
        typeof errJson?.detail === "object"
          ? JSON.stringify(errJson.detail)
          : errJson?.detail || errJson?.error || "";
    } catch (e) { reportError("crypto-sync", e); }
    const tag = res.status === 401 ? "אימות נכשל" : `שגיאה ${res.status}`;
    throw new Error(`${tag}${detail ? ` — ${detail}` : ""}`);
  }
  const data = (await res.json()) as { balances?: BinanceBalance[] };
  const balances = data.balances ?? [];

  if (balances.length === 0) {
    return {
      exchange: "binance",
      added: 0,
      updated: 0,
      removed: removeAccountCryptoPositions(accountId),
      skipped: [],
      totalValueIls: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  // 2. Map to CoinGecko + fetch prices
  const skipped: string[] = [];
  const assetToCoinId = new Map<string, string>();
  for (const b of balances) {
    const id = COINGECKO_BY_ASSET[b.asset.toUpperCase()];
    if (id) assetToCoinId.set(b.asset, id);
    else skipped.push(b.asset);
  }
  const uniqueCoinIds = Array.from(new Set(assetToCoinId.values()));
  const prices = uniqueCoinIds.length > 0 ? await fetchCryptoPricesBulk(uniqueCoinIds) : [];
  const priceByCoinId: Record<string, number> = {};
  for (const p of prices) priceByCoinId[p.symbol] = p.price;

  // 3. Build a lookup of existing crypto positions in this account
  const existing = loadPositions().filter(
    (p) => p.accountId === accountId && p.kind === "crypto"
  );
  const existingByAsset = new Map<string, Position>();
  for (const p of existing) existingByAsset.set(p.symbol.toUpperCase(), p);

  let added = 0;
  let updated = 0;
  let totalValueIls = 0;
  const seenAssets = new Set<string>();

  // 4. Upsert each balance
  for (const b of balances) {
    const coinId = assetToCoinId.get(b.asset);
    if (!coinId) continue; // already in `skipped`
    const ilsPrice = priceByCoinId[coinId] || 0;
    totalValueIls += ilsPrice * b.total;
    seenAssets.add(b.asset.toUpperCase());

    const existingPos = existingByAsset.get(b.asset.toUpperCase());
    if (existingPos) {
      updatePosition(existingPos.id, {
        quantity: b.total,
        currentPrice: ilsPrice,
        fxRateToIls: 1,
      });
      updated++;
    } else {
      addPosition({
        accountId,
        kind: "crypto",
        symbol: b.asset.toUpperCase(),
        quantity: b.total,
        avgCost: 0, // Binance /account doesn't return cost basis
        currentPrice: ilsPrice,
        currency: "ILS",
        fxRateToIls: 1,
      });
      added++;
    }
  }

  // 5. Remove positions for assets that left the wallet
  let removed = 0;
  for (const [asset, pos] of existingByAsset) {
    if (!seenAssets.has(asset)) {
      deletePosition(pos.id);
      removed++;
    }
  }

  return {
    exchange: "binance",
    added,
    updated,
    removed,
    skipped,
    totalValueIls,
    syncedAt: new Date().toISOString(),
  };
}

/** Helper: delete every crypto position in an account. */
function removeAccountCryptoPositions(accountId: string): number {
  const targets = loadPositions().filter(
    (p) => p.accountId === accountId && p.kind === "crypto"
  );
  for (const p of targets) deletePosition(p.id);
  return targets.length;
}
