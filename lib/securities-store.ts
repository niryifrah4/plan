/**
 * Securities Store — read-only adapter for downstream consumers
 * (dashboard, balance, net-worth) that don't import the full investments
 * page component.
 *
 * Source of truth, in order of preference:
 *   1. portfolio-store (`verdant:portfolio:positions`) — new unified model
 *   2. legacy `verdant:securities` blob — pre-migration fallback
 *
 * Output shape stays the SecurityRow legacy interface so callers don't
 * need to change. Once every page reads from portfolio-store directly,
 * this file can be deleted.
 */

import { scopedKey } from "./client-scope";
import { loadAccounts, loadPositions, valuePosition, type Position } from "./portfolio-store";

export const SECURITIES_KEY = "verdant:securities";

export interface SecurityRow {
  id: string;
  household_id?: string;
  kind: string;
  symbol: string;
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
  vest_date: string | null;
  strike_price: number | null;
}

/* ─── New store → legacy shape adapter ─────────────────────── */

function adaptPosition(pos: Position, brokerByAccountId: Map<string, string | undefined>): SecurityRow {
  const v = valuePosition(pos);
  return {
    id: pos.id,
    kind: pos.kind,
    symbol: pos.symbol,
    broker: brokerByAccountId.get(pos.accountId) ?? null,
    currency: pos.currency,
    // Only the vested portion counts as "owned" for legacy callers (matches
    // how the original /investments page summed market_value_ils — RSU with
    // no vest_date was treated as fully vested).
    quantity: v.effectiveQuantity,
    avg_cost: pos.avgCost,
    current_price: pos.currentPrice,
    fx_rate_to_ils: pos.fxRateToIls,
    cost_basis_ils: v.costBasisIls,
    market_value_ils: v.marketValueIls,
    unrealized_pnl_ils: v.unrealizedPnlIls,
    unrealized_pnl_pct: v.unrealizedPnlPct,
    vest_date: pos.grant?.vesting.startDate ?? null,
    strike_price: pos.grant?.strikePrice ?? null,
  };
}

/* ─── Public reads ─────────────────────────────────────────── */

/**
 * Load securities for downstream readers. Prefers the unified portfolio
 * store; falls back to the legacy blob if the portfolio store is empty.
 */
export function loadSecurities(): SecurityRow[] {
  if (typeof window === "undefined") return [];

  const positions = loadPositions();
  if (positions.length > 0) {
    const accounts = loadAccounts();
    const brokerByAccountId = new Map<string, string | undefined>();
    for (const a of accounts) {
      brokerByAccountId.set(a.id, a.broker || a.label);
    }
    return positions.map((p) => adaptPosition(p, brokerByAccountId));
  }

  // Legacy fallback — pre-migration users
  try {
    const raw = localStorage.getItem(scopedKey(SECURITIES_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SecurityRow[];
  } catch {}
  return [];
}

/** Sum of market_value_ils across all securities. */
export function totalSecuritiesValue(rows?: SecurityRow[]): number {
  const list = rows ?? loadSecurities();
  return list.reduce((sum, s) => sum + (Number(s.market_value_ils) || 0), 0);
}
