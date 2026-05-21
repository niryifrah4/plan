/**
 * ═══════════════════════════════════════════════════════════
 *  SINGLE SOURCE OF TRUTH — Debt & Liability Data Store
 * ═══════════════════════════════════════════════════════════
 *
 * All debt/mortgage/loan/installment data lives in ONE localStorage key:
 *   verdant:debt_data
 *
 * Every page that needs debt info reads from here via loadDebtData().
 * Only the /debt page writes to it.
 *
 * Derived views (for dashboards, wealth maps, budgets) use the
 * summary helpers below — never duplicating or storing debt data elsewhere.
 */

/* ── Core Types ── */

export type IndexationType = "מדד" | "לא צמוד" | "דולר" | "אחר";
export type RepaymentMethod = "שפיצר" | "קרן שווה" | "בלון" | "אחר";

export interface MortgageTrack {
  id: string;
  name: string;
  /**
   * Annual interest rate as a DECIMAL fraction (0.048 = 4.8%).
   * Ignored if `margin` is set — effective rate = primeRate + margin.
   * UI converts to/from percent at the input boundary.
   * 2026-05-19 Phase 1: standardized to decimal across the whole debt module.
   * Legacy percent-scale data (>1) is normalized on load by `migrateDebtShape`.
   */
  interestRate: number;
  /**
   * Optional margin over Prime as a DECIMAL fraction (0.005 = +0.5%).
   * When present, effective rate = primeRate + margin so Prime tracks
   * auto-update when BoI rate changes. Leave undefined for fixed-rate tracks.
   */
  margin?: number;
  indexation: IndexationType;
  repaymentMethod: RepaymentMethod;
  originalAmount: number;
  remainingBalance: number;
  monthlyPayment: number;
  startDate: string; // YYYY-MM
  endDate: string;
  totalPayments: number;
  [key: string]: any;
}

/**
 * Returns the effective interest rate for a track. If `margin` is set,
 * returns `primeRate + margin` (for Prime-linked tracks). Otherwise returns
 * the absolute `interestRate`.
 */
export function effectiveTrackRate(track: MortgageTrack, primeRate: number): number {
  if (typeof track.margin === "number") {
    return primeRate + track.margin;
  }
  return track.interestRate || 0;
}

export interface MortgageData {
  /**
   * Stable id for the mortgage. Required since 2026-05-18 — supports the
   * multi-mortgage model (a household can have several mortgages, one per
   * property). Legacy data is auto-id'd on load via `migrateDebtShape`.
   */
  id: string;
  /**
   * Optional foreign key to a Property in realestate-store. Once assigned,
   * the mortgage is "owned" by that property and shows on its card in
   * /realestate. Left undefined for legacy mortgages until the user picks
   * a property in /debt. UI surfaces unassigned mortgages with a prompt.
   */
  propertyId?: string;
  bank: string;
  propertyValue: number;
  tracks: MortgageTrack[];
}

export interface Loan {
  id: string;
  lender: string;
  startDate: string; // YYYY-MM
  totalPayments: number;
  monthlyPayment: number;
  /**
   * Annual interest rate as a DECIMAL fraction (0.065 = 6.5%). Optional —
   * older loans may lack it; calculations fall back to a heuristic only when
   * undefined and surface a disclaimer to the user.
   * Added 2026-05-05 per Nir + finance-agent: was previously hardcoded 6%.
   */
  interestRate?: number;
}

export interface Installment {
  id: string;
  merchant: string;
  source: string;
  currentPayment: number;
  totalPayments: number;
  monthlyAmount: number;
}

export interface DebtData {
  loans: Loan[];
  installments: Installment[];
  /**
   * Array of mortgages — a household can have one mortgage per property.
   * Changed 2026-05-18 from `mortgage?: MortgageData` to `mortgages: MortgageData[]`.
   * `migrateDebtShape()` converts old persisted data on read.
   */
  mortgages: MortgageData[];
}

import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";
import {
  pushDebtToTablesInBackground,
  backfillDebtFromBlobIfNeeded,
} from "./sync/debt-tables";
import { loadAssumptions } from "./assumptions";

const STORAGE_KEY = "verdant:debt_data";
const BLOB_KEY = "debt_data";

/* ── Legacy migration ─────────────────────────────────────────────────────
 * Two migrations happen here, both idempotent:
 *
 * 1. Shape: persisted data from before 2026-05-18 used `mortgage?:
 *    MortgageData` (single). New shape uses `mortgages: MortgageData[]`.
 *
 * 2. Rate scale (2026-05-19): legacy data stored mortgage `interestRate` and
 *    `margin` on a percent scale (4.8 meant 4.8%). New standard is decimal
 *    (0.048 = 4.8%) across the whole module. Any value > 1 is treated as
 *    legacy percent and divided by 100. Real Israeli mortgage rates never
 *    exceed 100%, so this heuristic is safe. Same migration is applied to
 *    `loan.interestRate` defensively, even though it was already decimal.
 *
 * Never mutates input, never loses data, never throws on garbage input.
 */
function normalizeRate(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return raw > 1 ? raw / 100 : raw;
}

function normalizeTrackRates(track: MortgageTrack): MortgageTrack {
  const next: MortgageTrack = { ...track };
  const ir = normalizeRate(track.interestRate);
  if (ir !== undefined) next.interestRate = ir;
  if (typeof track.margin === "number") {
    const m = normalizeRate(track.margin);
    if (m !== undefined) next.margin = m;
  }
  return next;
}

function normalizeLoanRates(loan: Loan): Loan {
  if (typeof loan.interestRate !== "number") return loan;
  const r = normalizeRate(loan.interestRate);
  return r === undefined ? loan : { ...loan, interestRate: r };
}

function migrateDebtShape(raw: unknown): DebtData {
  const empty: DebtData = { loans: [], installments: [], mortgages: [] };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const loansRaw = Array.isArray(obj.loans) ? (obj.loans as Loan[]) : [];
  const loans = loansRaw.map(normalizeLoanRates);
  const installments = Array.isArray(obj.installments) ? (obj.installments as Installment[]) : [];

  // New shape already
  if (Array.isArray(obj.mortgages)) {
    // Ensure each mortgage has a stable id (defensive — older partial saves)
    // and normalize rate scale on every track.
    const mortgages = (obj.mortgages as MortgageData[]).map((m, i) => ({
      ...m,
      id: m.id || `mtg_${Date.now()}_${i}`,
      tracks: (m.tracks || []).map(normalizeTrackRates),
    }));
    return { loans, installments, mortgages };
  }

  // Legacy single-mortgage shape — convert
  const legacy = obj.mortgage as MortgageData | undefined;
  const mortgages: MortgageData[] =
    legacy && legacy.tracks && legacy.tracks.length > 0
      ? [
          {
            ...legacy,
            id: legacy.id || "mtg_legacy",
            tracks: legacy.tracks.map(normalizeTrackRates),
          },
        ]
      : [];
  return { loans, installments, mortgages };
}

/* ── Read / Write ── */

export function loadDebtData(): DebtData {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) return migrateDebtShape(JSON.parse(raw));
  } catch {}
  return { loans: [], installments: [], mortgages: [] };
}

export function saveDebtData(data: DebtData): void {
  try {
    // Always persist in the new shape — drop any leftover legacy `mortgage`.
    const clean: DebtData = {
      loans: data.loans || [],
      installments: data.installments || [],
      mortgages: data.mortgages || [],
    };
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(clean));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verdant:debt:updated"));
    }
    // Phase 2 dual-write (2026-05-19): write to BOTH the JSON blob (legacy
    // read path) and the typed tables (Phase 3+ read path). The blob is
    // still authoritative; the typed tables are mirrored best-effort.
    // Either write can fail without the other.
    pushBlobInBackground(BLOB_KEY, clean);
    pushDebtToTablesInBackground(clean);
  } catch (e) {
    console.warn("[DebtStore] save failed:", e);
  }
}

/** Pull from Supabase and overwrite local. Call on boot / household switch. */
export async function hydrateDebtFromRemote(): Promise<boolean> {
  const remote = await pullBlob<unknown>(BLOB_KEY);
  if (!remote) return false;
  try {
    const migrated = migrateDebtShape(remote);
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(migrated));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verdant:debt:updated"));
    }
    // Phase 2 backfill (2026-05-19): if the typed tables are empty for this
    // household but the blob has data, push the data into the typed tables
    // once. Idempotent and fire-and-forget — never blocks hydration.
    void backfillDebtFromBlobIfNeeded(migrated);
    return true;
  } catch {
    return false;
  }
}

/* ── Activity Checks ── */

export function loanElapsedMonths(startDate: string): number {
  if (!startDate) return 0;
  const [y, m] = startDate.split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

export function isLoanActive(loan: Loan): boolean {
  if (!loan.startDate || !loan.totalPayments) return false;
  return loanElapsedMonths(loan.startDate) < loan.totalPayments;
}

export function isInstallmentActive(inst: Installment): boolean {
  return inst.currentPayment <= inst.totalPayments;
}

/* ── Multi-mortgage helpers (new in 2026-05-18) ───────────────────────── */

/** Flatten all tracks across every mortgage. Use when "all tracks" is the right unit. */
export function getAllMortgageTracks(data: DebtData): MortgageTrack[] {
  return data.mortgages.flatMap((m) => m.tracks || []);
}

/** Find every mortgage attached to a given property (typically 0 or 1). */
export function getMortgagesForProperty(data: DebtData, propertyId: string): MortgageData[] {
  return data.mortgages.filter((m) => m.propertyId === propertyId);
}

/** Mortgages with no propertyId set — used to prompt the user to assign one. */
export function getUnassignedMortgages(data: DebtData): MortgageData[] {
  return data.mortgages.filter((m) => !m.propertyId);
}

/**
 * Summary of mortgage(s) attached to a single property — used by the
 * /realestate page to render per-property mortgage info. Returns zero
 * totals when the property has no mortgage assigned.
 */
export interface PropertyMortgageSummary {
  mortgages: MortgageData[];
  tracks: MortgageTrack[];
  monthlyPayment: number;
  remainingBalance: number;
  originalAmount: number;
  /** Weighted-by-balance avg interest rate, as a DECIMAL fraction (0.048 = 4.8%). */
  weightedAvgInterest: number;
}

export function getPropertyMortgageSummary(
  propertyId: string,
  data?: DebtData,
  primeRate?: number
): PropertyMortgageSummary {
  const d = data ?? loadDebtData();
  const rate = primeRate ?? loadAssumptions().primeRate;
  const mortgages = getMortgagesForProperty(d, propertyId);
  const tracks = mortgages.flatMap((m) => m.tracks || []);
  const monthlyPayment = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  const remainingBalance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const originalAmount = tracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
  const totalBal = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const weightedAvgInterest =
    totalBal > 0
      ? tracks.reduce(
          (s, t) => s + effectiveTrackRate(t, rate) * (t.remainingBalance || 0),
          0
        ) / totalBal
      : 0;
  return {
    mortgages,
    tracks,
    monthlyPayment,
    remainingBalance,
    originalAmount,
    weightedAvgInterest,
  };
}

/* ── Summary Aggregators (used by dashboard, wealth, budget) ── */

export interface DebtSummary {
  /** Total monthly debt service (mortgage + loans + installments) */
  monthlyTotal: number;
  /** Breakdown */
  mortgageMonthly: number;
  loansMonthly: number;
  installmentsMonthly: number;
  /** Outstanding balances */
  mortgageBalance: number;
  loansBalance: number;
  /** Active counts */
  activeLoans: Loan[];
  activeInstallments: Installment[];
  mortgageTracks: MortgageTrack[];
  /** Weighted average mortgage interest */
  mortgageAvgInterest: number;
}

export function getDebtSummary(data?: DebtData, primeRate?: number): DebtSummary {
  const d = data ?? loadDebtData();
  const rate = primeRate ?? loadAssumptions().primeRate;

  const activeLoans = d.loans.filter(isLoanActive);
  const activeInstallments = d.installments.filter(isInstallmentActive);
  const mortgageTracks = getAllMortgageTracks(d);

  const mortgageMonthly = mortgageTracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  const loansMonthly = activeLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const installmentsMonthly = activeInstallments.reduce((s, i) => s + (i.monthlyAmount || 0), 0);

  const mortgageBalance = mortgageTracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const loansBalance = activeLoans.reduce((s, l) => {
    const remain = Math.max(0, l.totalPayments - loanElapsedMonths(l.startDate));
    return s + remain * (l.monthlyPayment || 0);
  }, 0);

  // Weighted average mortgage interest — uses effectiveTrackRate so Prime
  // tracks (where interestRate is 0 and only margin is set) contribute their
  // real effective rate (primeRate + margin) instead of 0%.
  // 2026-05-18 fix per finance-agent: was producing 0% for Prime tracks,
  // dragging dashboard avg-interest dramatically below reality.
  // Result is a DECIMAL fraction (0.048 = 4.8%) — Phase 1 scale standard.
  const totalMortgageOrig = mortgageTracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
  const mortgageAvgInterest =
    totalMortgageOrig > 0
      ? mortgageTracks.reduce(
          (s, t) => s + effectiveTrackRate(t, rate) * (t.originalAmount || 0),
          0
        ) / totalMortgageOrig
      : 0;

  return {
    monthlyTotal: mortgageMonthly + loansMonthly + installmentsMonthly,
    mortgageMonthly,
    loansMonthly,
    installmentsMonthly,
    mortgageBalance,
    loansBalance,
    activeLoans,
    activeInstallments,
    mortgageTracks,
    mortgageAvgInterest,
  };
}

/**
 * For the Wealth Map: returns liabilities in the standard Liability shape
 * used by the wealth page, merging real debt data with the stub format.
 */
export interface LiabilitySummaryRow {
  id: string;
  name: string;
  liability_group: "mortgage" | "loans" | "cc";
  balance: number;
  /** Annual rate as a PERCENT scalar (4.8 = 4.8%). Matches the field name and
   * `tasks-engine`'s "expensive debt" threshold of `rate_pct > 8`. */
  rate_pct: number;
  monthly_payment: number;
}

export function getDebtAsLiabilities(primeRate?: number): LiabilitySummaryRow[] {
  const d = loadDebtData();
  const rate = primeRate ?? loadAssumptions().primeRate;
  const rows: LiabilitySummaryRow[] = [];

  // Mortgages — one aggregated row per mortgage. Uses effectiveTrackRate so
  // Prime-margin tracks contribute their true effective rate instead of the
  // raw 0 stored in `interestRate`.
  for (const mortgage of d.mortgages) {
    const tracks = mortgage.tracks || [];
    if (tracks.length === 0) continue;
    const totalBalance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
    const totalMonthly = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
    const totalOrig = tracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
    const avgRateDecimal =
      totalOrig > 0
        ? tracks.reduce(
            (s, t) => s + effectiveTrackRate(t, rate) * (t.originalAmount || 0),
            0
          ) / totalOrig
        : 0;
    rows.push({
      id: `debt-mortgage-${mortgage.id}`,
      name: mortgage.bank ? `משכנתא — ${mortgage.bank}` : "משכנתא",
      liability_group: "mortgage",
      balance: totalBalance,
      rate_pct: avgRateDecimal * 100,
      monthly_payment: totalMonthly,
    });
  }

  // Loans — expose the stored rate (decimal) as percent, so `tasks-engine`
  // can flag expensive loans (rate_pct > 8). Returns 0 when rate unset.
  const activeLoans = d.loans.filter(isLoanActive);
  for (const l of activeLoans) {
    const remain = Math.max(0, l.totalPayments - loanElapsedMonths(l.startDate));
    rows.push({
      id: `debt-loan-${l.id}`,
      name: l.lender || "הלוואה",
      liability_group: "loans",
      balance: remain * (l.monthlyPayment || 0),
      rate_pct: (l.interestRate ?? 0) * 100,
      monthly_payment: l.monthlyPayment || 0,
    });
  }

  // Installments as cc/credit group
  const activeInst = d.installments.filter(isInstallmentActive);
  if (activeInst.length > 0) {
    const totalMonthly = activeInst.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
    const totalBalance = activeInst.reduce((s, i) => {
      const remain = Math.max(0, i.totalPayments - i.currentPayment + 1);
      return s + remain * (i.monthlyAmount || 0);
    }, 0);
    rows.push({
      id: "debt-installments",
      name: `עסקאות תשלומים (${activeInst.length})`,
      liability_group: "cc",
      balance: totalBalance,
      rate_pct: 0,
      monthly_payment: totalMonthly,
    });
  }

  return rows;
}

/**
 * Net worth calculation helper:
 * Returns total liabilities from real debt data for Net Worth = Assets - Liabilities.
 */
export function getTotalLiabilities(): number {
  const rows = getDebtAsLiabilities();
  return rows.reduce((s, r) => s + r.balance, 0);
}
