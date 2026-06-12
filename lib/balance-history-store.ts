/**
 * ═══════════════════════════════════════════════════════════
 *  Balance History Store — Net Worth Snapshots Over Time
 * ═══════════════════════════════════════════════════════════
 *
 * One-click monthly snapshot of the client's full net-worth
 * breakdown. Reads every other store in read-only fashion.
 *
 * localStorage key: verdant:balance_history
 * Event: verdant:balance_history:updated
 */

import { loadAccounts, totalBankBalance, totalCreditCharges } from "./accounts-store";
import { loadPensionFunds } from "./pension-store";
import { loadProperties } from "./realestate-store";
import { getTotalLiabilities, loadDebtData, getAllMortgageTracks } from "./debt-store";
import { loadBuckets, totalBucketBalance } from "./buckets-store";
import { totalSecuritiesValue } from "./securities-store";
import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";
import { reportError } from "@/lib/report-error";

const STORAGE_KEY = "verdant:balance_history";
export const BALANCE_HISTORY_EVENT = "verdant:balance_history:updated";

/* ── Types ── */

export interface NetWorthBreakdown {
  cash: number; // bank accounts − credit card charges
  investments: number; // securities total value (TODO: pending real source)
  pension: number; // sum of pension fund balances
  realestate: number; // sum of property currentValue
  goals: number; // sum of bucket balances (earmarked cash)
  debt: number; // non-mortgage debt (loans + installments)
  mortgages: number; // mortgage balances
}

export interface NetWorthSnapshot {
  id: string;
  date: string; // ISO YYYY-MM-DD
  breakdown: NetWorthBreakdown;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note?: string;
}

/* ── Helpers ── */

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

/* ── Compute live breakdown ── */

export function computeCurrentNetWorth(): NetWorthBreakdown {
  const empty: NetWorthBreakdown = {
    cash: 0,
    investments: 0,
    pension: 0,
    realestate: 0,
    goals: 0,
    debt: 0,
    mortgages: 0,
  };
  if (typeof window === "undefined") return empty;

  // Cash: bank balances minus credit card charges
  let cash = 0;
  try {
    const acc = loadAccounts();
    cash = totalBankBalance(acc) - totalCreditCharges(acc);
  } catch (e) { reportError("balance-history-store", e); }

  // Pension: sum of fund balances
  let pension = 0;
  try {
    pension = loadPensionFunds().reduce((s, f) => s + (f.balance || 0), 0);
  } catch (e) { reportError("balance-history-store", e); }

  // Real estate: sum of currentValue
  let realestate = 0;
  try {
    realestate = loadProperties().reduce((s, p) => s + (p.currentValue || 0), 0);
  } catch (e) { reportError("balance-history-store", e); }

  // Goals: sum of bucket current amounts
  let goals = 0;
  try {
    goals = totalBucketBalance(loadBuckets());
  } catch (e) { reportError("balance-history-store", e); }

  // Debt split: mortgages vs other
  let debt = 0;
  let mortgages = 0;
  try {
    const d = loadDebtData();
    mortgages = getAllMortgageTracks(d).reduce((s, t) => s + (t.remainingBalance || 0), 0);
    const totalAll = getTotalLiabilities();
    debt = Math.max(0, totalAll - mortgages);
  } catch (e) { reportError("balance-history-store", e); }

  // Investments: sum of market_value_ils across all securities.
  let investments = 0;
  try {
    investments = totalSecuritiesValue();
  } catch (e) { reportError("balance-history-store", e); }

  return { cash, investments, pension, realestate, goals, debt, mortgages };
}

/**
 * Sum a NetWorthBreakdown into a single total-assets number.
 *
 * IMPORTANT (finance-agent audit 2026-05-22): `goals` is NOT included.
 * Buckets are an earmark / tracking layer over money that already lives
 * in one of the underlying asset pools (cash, investments, pension).
 * Adding `goals` here double-counts that money. We keep `goals` in the
 * breakdown for UI display so users can still see "₪50k earmarked for
 * X", but the wealth aggregate uses only the underlying pools.
 */
export function sumAssetPools(b: NetWorthBreakdown): number {
  return b.cash + b.investments + b.pension + b.realestate;
}

export function sumLiabilityPools(b: NetWorthBreakdown): number {
  return b.debt + b.mortgages;
}

export function buildSnapshotFromCurrent(note?: string): NetWorthSnapshot {
  const breakdown = computeCurrentNetWorth();
  const totalAssets = sumAssetPools(breakdown);
  const totalLiabilities = sumLiabilityPools(breakdown);
  const netWorth = totalAssets - totalLiabilities;

  return {
    id: uid(),
    date: todayISO(),
    breakdown,
    totalAssets,
    totalLiabilities,
    netWorth,
    note: note?.trim() || undefined,
  };
}

/* ── Persistence ── */

export function loadHistory(): NetWorthSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as NetWorthSnapshot[])
      .filter((s) => s && typeof s.date === "string")
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveHistory(snapshots: NetWorthSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(snapshots));
    window.dispatchEvent(new CustomEvent(BALANCE_HISTORY_EVENT));
    pushBlobInBackground("balance_history", snapshots);
  } catch (e) {
    console.warn("[balance-history-store] save failed:", e);
  }
}

export async function hydrateHistoryFromRemote(): Promise<boolean> {
  const remote = await pullBlob<NetWorthSnapshot[]>("balance_history");
  if (!remote || !Array.isArray(remote)) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(BALANCE_HISTORY_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function addSnapshot(snapshot: NetWorthSnapshot): NetWorthSnapshot[] {
  const existing = loadHistory();
  const key = monthKey(snapshot.date);
  // One snapshot per month — replace if same YYYY-MM exists
  const filtered = existing.filter((s) => monthKey(s.date) !== key);
  const next = [...filtered, snapshot].sort((a, b) => a.date.localeCompare(b.date));
  saveHistory(next);
  return next;
}

export function deleteSnapshot(id: string): NetWorthSnapshot[] {
  const next = loadHistory().filter((s) => s.id !== id);
  saveHistory(next);
  return next;
}
