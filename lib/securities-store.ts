/**
 * Securities Store — thin reader over the same localStorage key used by
 * the /investments page. Kept separate so non-investment pages (balance
 * history, dashboard, etc.) can compute portfolio value without importing
 * the full investments page component.
 *
 * Write path lives inside app/(client)/investments/page.tsx for now;
 * this file is READ-ONLY to avoid dual-owner bugs.
 */

import { scopedKey } from "./client-scope";

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

/**
 * Load securities from localStorage. Returns [] on SSR or when missing.
 * Does NOT fall back to demo data — that's the investments page's job.
 */
export function loadSecurities(): SecurityRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(SECURITIES_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SecurityRow[];
  } catch {}
  return [];
}

/**
 * Sum of market_value_ils across all securities. The per-row value is
 * already pre-computed by the investments page (quantity × price × fx).
 */
export function totalSecuritiesValue(rows?: SecurityRow[]): number {
  const list = rows ?? loadSecurities();
  return list.reduce((sum, s) => sum + (Number(s.market_value_ils) || 0), 0);
}
