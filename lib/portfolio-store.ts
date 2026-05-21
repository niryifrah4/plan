/**
 * ═══════════════════════════════════════════════════════════
 *  Portfolio Store — Unified investments + equity comp
 * ═══════════════════════════════════════════════════════════
 *
 * Single source of truth for everything a household holds in the markets:
 * stocks, ETFs, crypto, bonds, funds — plus RSU / ESPP / options with
 * full §102 vesting model.
 *
 * Replaces, over time, the two parallel stores:
 *   • verdant:securities      (the /investments stash, flat RSU)
 *   • verdant:equity_grants   (the /equity stash, full vesting)
 *
 * This file is the data layer only. It sits alongside the legacy stores
 * during the transition and is wired into pages in a later step.
 *
 * Storage keys (per-client scoped via client-scope.ts):
 *   verdant:portfolio:accounts    Account[]   broker / brokerage / wallet
 *   verdant:portfolio:positions   Position[]  one row per holding or grant
 */

import { scopedKey } from "./client-scope";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

export type Currency = "ILS" | "USD" | "EUR" | "GBP";

/**
 * Tradeable on a public market: stock, etf, crypto, bond, fund
 * Employee equity compensation:  rsu, espp, option
 */
export type AssetKind =
  | "stock"
  | "etf"
  | "crypto"
  | "bond"
  | "fund"
  | "rsu"
  | "espp"
  | "option";

const EQUITY_COMP_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(["rsu", "espp", "option"]);

export function isEquityComp(kind: AssetKind): boolean {
  return EQUITY_COMP_KINDS.has(kind);
}

/** Section 102 long-term capital track + ordinary CGT — same 25% flat. */
export const TAX_RATE_DEFAULT = 0.25;

/* ─── Account ───────────────────────────────────────────────── */

/**
 * A "place" where positions live: IBKR, בלינסון, Morgan Stanley, Coinbase…
 * Used to group/filter positions in the UI.
 */
export interface Account {
  id: string;
  label: string;
  broker?: string;
  currency: Currency;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Vesting (equity comp only) ────────────────────────────── */

export interface VestingSchedule {
  /** ISO yyyy-mm-dd */
  startDate: string;
  /** Total vesting period in months, e.g. 48. */
  totalMonths: number;
  /** Cliff in months. 0 = no cliff. */
  cliffMonths: number;
  frequency: "monthly" | "quarterly";
}

/* ─── Position — one row per holding or grant ──────────────── */

export interface Position {
  id: string;
  accountId: string;
  kind: AssetKind;
  /** Ticker / coin id / RSU symbol. */
  symbol: string;
  /** Display name override (defaults to symbol). */
  name?: string;

  /** Regular: shares/units held.  Grant: total shares granted. */
  quantity: number;
  /** Per-unit cost in `currency`. RSU=0, options=strike, regular=avg buy price. */
  avgCost: number;
  /** Per-unit market price in `currency`. */
  currentPrice: number;
  currency: Currency;
  /** 1 unit of `currency` → ILS. ILS=1. */
  fxRateToIls: number;

  /** Equity-comp metadata. Required for rsu/espp/option, absent otherwise. */
  grant?: {
    company?: string;
    /** Options only — strike price in `currency`. */
    strikePrice?: number;
    vesting: VestingSchedule;
  };

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Derived valuation ─────────────────────────────────────── */

export interface PositionValuation {
  positionId: string;
  /** Held today: vested for grants, full quantity for regular. */
  effectiveQuantity: number;
  /** Still locked (grants only). 0 for regular. */
  unvestedQuantity: number;
  /** 0–1. Always 1 for regular positions. */
  vestedPct: number;

  costBasisIls: number;
  marketValueIls: number;
  /** Potential value of still-locked shares (grants). */
  unvestedValueIls: number;
  unrealizedPnlIls: number;
  unrealizedPnlPct: number;

  taxIls: number;
  netAfterTaxIls: number;
}

/* ─────────────────────────────────────────────────────────────
   Storage
   ───────────────────────────────────────────────────────────── */

const ACCOUNTS_KEY = "verdant:portfolio:accounts";
const POSITIONS_KEY = "verdant:portfolio:positions";

export const PORTFOLIO_EVENT = "verdant:portfolio:updated";

function nowIso(): string {
  return new Date().toISOString();
}
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Accounts CRUD ─────────────────────────────────────────── */

export function loadAccounts(): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(ACCOUNTS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(ACCOUNTS_KEY), JSON.stringify(accounts));
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
  } catch {}
}

export function addAccount(input: Omit<Account, "id" | "createdAt" | "updatedAt">): Account {
  const account: Account = { ...input, id: uid("acc"), createdAt: nowIso(), updatedAt: nowIso() };
  saveAccounts([...loadAccounts(), account]);
  return account;
}

export function updateAccount(
  id: string,
  patch: Partial<Omit<Account, "id" | "createdAt">>
): void {
  const next = loadAccounts().map((a) =>
    a.id === id ? { ...a, ...patch, updatedAt: nowIso() } : a
  );
  saveAccounts(next);
}

/**
 * Deletes the account row but NOT its positions — they're left orphaned
 * (accountId points to nothing) and surface in an "ללא חשבון" group in
 * the UI. The caller decides whether to delete them or reassign.
 */
export function deleteAccount(id: string): void {
  saveAccounts(loadAccounts().filter((a) => a.id !== id));
}

/* ─── Positions CRUD ────────────────────────────────────────── */

export function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(POSITIONS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePositions(positions: Position[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(POSITIONS_KEY), JSON.stringify(positions));
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
  } catch {}
}

export function addPosition(input: Omit<Position, "id" | "createdAt" | "updatedAt">): Position {
  const pos: Position = { ...input, id: uid("pos"), createdAt: nowIso(), updatedAt: nowIso() };
  savePositions([...loadPositions(), pos]);
  return pos;
}

export function updatePosition(
  id: string,
  patch: Partial<Omit<Position, "id" | "createdAt">>
): void {
  const next = loadPositions().map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p
  );
  savePositions(next);
}

export function deletePosition(id: string): void {
  savePositions(loadPositions().filter((p) => p.id !== id));
}

/* ─────────────────────────────────────────────────────────────
   Computations
   ───────────────────────────────────────────────────────────── */

/**
 * Shares vested as of `asOf` for a grant position. Regular positions
 * return `quantity` unchanged ("everything is vested").
 *
 * Vesting model:
 *   • Nothing vests before `cliffMonths` elapse.
 *   • After cliff, shares vest in equal slices on a monthly/quarterly cadence.
 *   • A slice is "elapsed" the moment the corresponding period starts.
 *   • Day-of-month earlier than `startDate.day` counts as one month short
 *     (matches the existing /equity behaviour).
 */
export function computeVestedQuantity(pos: Position, asOf: Date = new Date()): number {
  if (!isEquityComp(pos.kind) || !pos.grant) return pos.quantity;

  const v = pos.grant.vesting;
  const start = new Date(v.startDate);
  const monthsElapsed = Math.max(
    0,
    (asOf.getFullYear() - start.getFullYear()) * 12 +
      (asOf.getMonth() - start.getMonth()) +
      (asOf.getDate() >= start.getDate() ? 0 : -1)
  );

  if (monthsElapsed < v.cliffMonths) return 0;

  const monthsPerSlice = v.frequency === "quarterly" ? 3 : 1;
  const totalSlices = Math.floor(v.totalMonths / monthsPerSlice);
  if (totalSlices === 0) return 0;
  const slicesElapsed = Math.min(totalSlices, Math.floor(monthsElapsed / monthsPerSlice));
  const vested = Math.floor((pos.quantity * slicesElapsed) / totalSlices);
  return Math.min(vested, pos.quantity);
}

/**
 * Full ILS valuation for a single position. One formula serves both
 * regular and equity-comp positions:
 *   • Regular: effectiveQuantity = quantity, unvestedQuantity = 0, vestedPct = 1
 *   • Grant:   effectiveQuantity = computeVestedQuantity(), the rest unlocks over time
 *
 * Tax assumes 25% flat on positive gain — covers both §102 capital track
 * and standard CGT. Strike-price treatment for options is deferred to a
 * later iteration (today they're modelled like a discounted purchase).
 */
export function valuePosition(pos: Position, asOf: Date = new Date()): PositionValuation {
  const effectiveQuantity = computeVestedQuantity(pos, asOf);
  const unvestedQuantity = Math.max(0, pos.quantity - effectiveQuantity);
  const vestedPct = pos.quantity > 0 ? effectiveQuantity / pos.quantity : 0;

  const unitCostIls = pos.avgCost * pos.fxRateToIls;
  const unitMarketIls = pos.currentPrice * pos.fxRateToIls;

  const costBasisIls = effectiveQuantity * unitCostIls;
  const marketValueIls = effectiveQuantity * unitMarketIls;
  const unvestedValueIls = unvestedQuantity * unitMarketIls;

  const unrealizedPnlIls = marketValueIls - costBasisIls;
  const unrealizedPnlPct =
    costBasisIls > 0
      ? (unrealizedPnlIls / costBasisIls) * 100
      : marketValueIls > 0
        ? 100
        : 0;

  const gain = Math.max(0, unrealizedPnlIls);
  const taxIls = gain * TAX_RATE_DEFAULT;
  const netAfterTaxIls = marketValueIls - taxIls;

  return {
    positionId: pos.id,
    effectiveQuantity,
    unvestedQuantity,
    vestedPct,
    costBasisIls,
    marketValueIls,
    unvestedValueIls,
    unrealizedPnlIls,
    unrealizedPnlPct,
    taxIls,
    netAfterTaxIls,
  };
}

/* ─── Portfolio-level rollup ────────────────────────────────── */

export interface PortfolioSummary {
  positions: number;
  totalMarketValueIls: number;
  totalCostBasisIls: number;
  totalUnvestedValueIls: number;
  totalUnrealizedPnlIls: number;
  totalTaxIls: number;
  totalNetAfterTaxIls: number;
}

export function summarizePortfolio(
  positions: Position[],
  asOf: Date = new Date()
): PortfolioSummary {
  let market = 0,
    cost = 0,
    unvested = 0,
    pnl = 0,
    tax = 0,
    net = 0;
  for (const p of positions) {
    const v = valuePosition(p, asOf);
    market += v.marketValueIls;
    cost += v.costBasisIls;
    unvested += v.unvestedValueIls;
    pnl += v.unrealizedPnlIls;
    tax += v.taxIls;
    net += v.netAfterTaxIls;
  }
  return {
    positions: positions.length,
    totalMarketValueIls: market,
    totalCostBasisIls: cost,
    totalUnvestedValueIls: unvested,
    totalUnrealizedPnlIls: pnl,
    totalTaxIls: tax,
    totalNetAfterTaxIls: net,
  };
}
