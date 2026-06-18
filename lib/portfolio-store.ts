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
import { safeSetItem } from "@/lib/safe-storage";
import { pushBlob, pullBlob } from "./sync/blob-sync";
import { reportError } from "@/lib/report-error";

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

/**
 * Section 102 "ordinary income" track — applied when an RSU/ESPP grant
 * is sold/valued **before** completing 24 months from grant. The full
 * marginal bracket applies; we use the top Israeli bracket (47%) as a
 * conservative planning estimate. Real liability depends on the
 * employee's full income.
 */
export const TAX_RATE_102_ORDINARY = 0.47;

/** §102 minimum holding period for capital-gains-track treatment. */
const SECTION_102_HOLDING_MONTHS = 24;

/**
 * Effective tax rate for a single position at a given date.
 *
 * Non-equity (stock/etf/crypto/bond/fund) — flat 25% capital gains.
 *
 * Equity comp (RSU/ESPP/option) with §102 trust route:
 *   • ≥24 months from grant start → 25% capital gains track
 *   • <24 months → ordinary income at 47% (top bracket; conservative)
 *
 * NOTE: this is a planning approximation. The exact §102 rule depends on
 * the trust deposit date and whether the grant is "capital track" or
 * "ordinary track" from inception. Real-world tax filings should always
 * reference the employer's grant documentation.
 */
export function effectiveTaxRate(pos: Position, asOf: Date = new Date()): number {
  if (!pos.grant) return TAX_RATE_DEFAULT;
  const start = pos.grant.vesting?.startDate;
  if (!start) return TAX_RATE_DEFAULT; // missing data → assume favorable
  const startMs = new Date(start).getTime();
  if (!isFinite(startMs)) return TAX_RATE_DEFAULT;
  const monthsHeld = (asOf.getTime() - startMs) / (1000 * 60 * 60 * 24 * 30.44);
  return monthsHeld >= SECTION_102_HOLDING_MONTHS
    ? TAX_RATE_DEFAULT
    : TAX_RATE_102_ORDINARY;
}

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
  /** Statement / market snapshot date, ISO yyyy-mm-dd when imported from a broker report. */
  asOfDate?: string;

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

/** Supabase blob keys — single blob per (household, key) in client_state. */
const ACCOUNTS_BLOB_KEY = "portfolio_accounts";
const POSITIONS_BLOB_KEY = "portfolio_positions";

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
    safeSetItem(scopedKey(ACCOUNTS_KEY), JSON.stringify(accounts));
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
    // Server is the source of truth. Write straight to Supabase (awaited
    // internally, dequeues any stale queued push) instead of the background
    // retry queue — the persisted queue used to resurrect deleted positions.
    // localStorage above is only a server-fed read cache for downstream pages.
    void pushBlob(ACCOUNTS_BLOB_KEY, accounts);
  } catch (e) { reportError("portfolio-store", e); }
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

export async function saveAccountsAsync(accounts: Account[]): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { pushBlob } = await import("./sync/blob-sync");
    const ok = await pushBlob(ACCOUNTS_BLOB_KEY, accounts);
    if (!ok) return false;
    safeSetItem(scopedKey(ACCOUNTS_KEY), JSON.stringify(accounts));
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
    return true;
  } catch (e) {
    reportError("portfolio-store", e);
    return false;
  }
}

export function savePositions(positions: Position[]): void {
  if (typeof window === "undefined") return;
  try {
    safeSetItem(scopedKey(POSITIONS_KEY), JSON.stringify(positions));
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
    // See saveAccounts — direct awaited write, no background retry queue.
    void pushBlob(POSITIONS_BLOB_KEY, positions);
  } catch (e) { reportError("portfolio-store", e); }
}

export async function savePositionsAsync(positions: Position[]): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { pushBlob } = await import("./sync/blob-sync");
    const ok = await pushBlob(POSITIONS_BLOB_KEY, positions);
    if (!ok) return false;
    safeSetItem(scopedKey(POSITIONS_KEY), JSON.stringify(positions));
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
    return true;
  } catch (e) {
    reportError("portfolio-store", e);
    return false;
  }
}

/**
 * Pull from Supabase and overwrite local. Called from bootstrap on
 * tenant switch. Returns true if remote had data and we wrote it.
 */
export async function hydratePortfolioFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let wrote = false;
  try {
    const accounts = await pullBlob<Account[]>(ACCOUNTS_BLOB_KEY);
    if (Array.isArray(accounts)) {
      safeSetItem(scopedKey(ACCOUNTS_KEY), JSON.stringify(accounts));
      wrote = true;
    }
  } catch (e) { reportError("portfolio-store", e); }
  try {
    const positions = await pullBlob<Position[]>(POSITIONS_BLOB_KEY);
    if (Array.isArray(positions)) {
      safeSetItem(scopedKey(POSITIONS_KEY), JSON.stringify(positions));
      wrote = true;
    }
  } catch (e) { reportError("portfolio-store", e); }
  if (wrote && typeof window !== "undefined") {
    window.dispatchEvent(new Event(PORTFOLIO_EVENT));
  }
  return wrote;
}

/**
 * Server-authoritative load for the /investments page. Pulls both blobs
 * straight from Supabase (the single source of truth), mirrors them into the
 * localStorage read-cache so downstream synchronous readers stay consistent,
 * and returns the arrays for the page to hold in React state.
 *
 * Unlike loadAccounts/loadPositions (which read localStorage), this never lets
 * a stale local copy win — the page that calls it shows exactly what the DB has.
 */
export async function fetchPortfolioRemote(): Promise<{
  accounts: Account[];
  positions: Position[];
}> {
  if (typeof window === "undefined") return { accounts: [], positions: [] };
  // Before the active household is known (early bootstrap), a server pull would
  // return null and we'd wrongly wipe the cache. Fall back to whatever the
  // localStorage cache already holds; bootstrap fires PORTFOLIO_EVENT once the
  // server data lands.
  const { getHouseholdId } = await import("./sync/remote-sync");
  if (!getHouseholdId()) {
    return { accounts: loadAccounts(), positions: loadPositions() };
  }
  let accounts: Account[] = [];
  let positions: Position[] = [];
  try {
    const remote = await pullBlob<Account[]>(ACCOUNTS_BLOB_KEY);
    accounts = Array.isArray(remote) ? remote : [];
    safeSetItem(scopedKey(ACCOUNTS_KEY), JSON.stringify(accounts));
  } catch (e) { reportError("portfolio-store", e); }
  try {
    const remote = await pullBlob<Position[]>(POSITIONS_BLOB_KEY);
    positions = Array.isArray(remote) ? remote : [];
    safeSetItem(scopedKey(POSITIONS_KEY), JSON.stringify(positions));
  } catch (e) { reportError("portfolio-store", e); }
  return { accounts, positions };
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

export function updatePositions(
  updates: { id: string; patch: Partial<Omit<Position, "id" | "createdAt">> }[]
): void {
  if (updates.length === 0) return;
  const updateMap = new Map(updates.map((u) => [u.id, u.patch]));
  const next = loadPositions().map((p) => {
    const patch = updateMap.get(p.id);
    return patch ? { ...p, ...patch, updatedAt: nowIso() } : p;
  });
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
  // §102-aware: RSU/ESPP under 24 months from grant pays ordinary income
  // (top bracket conservative estimate), ≥24 months pays 25% capital
  // gains. Regular positions always 25%.
  const taxIls = gain * effectiveTaxRate(pos, asOf);
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
    const hasCostBasis = v.costBasisIls > 0;
    market += v.marketValueIls;
    cost += v.costBasisIls;
    unvested += v.unvestedValueIls;
    if (hasCostBasis) {
      pnl += v.unrealizedPnlIls;
      tax += v.taxIls;
      net += v.netAfterTaxIls;
    } else {
      net += v.marketValueIls;
    }
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
