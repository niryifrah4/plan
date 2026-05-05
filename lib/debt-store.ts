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
  /** Absolute interest rate (e.g. 0.048). Ignored if `margin` is set — effective rate = primeRate + margin. */
  interestRate: number;
  /**
   * Optional margin over Prime (e.g. 0.005 = +0.5%). When present, effective
   * rate is derived as `primeRate + margin` so Prime tracks auto-update when
   * BoI rate changes. Leave undefined for fixed-rate tracks.
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
   * Annual interest rate as a fraction (0.065 = 6.5%). Optional — older
   * loans may lack it; calculations fall back to a heuristic only when
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
  mortgage?: MortgageData;
}

import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:debt_data";
const BLOB_KEY = "debt_data";

/* ── Read / Write ── */

export function loadDebtData(): DebtData {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { loans: [], installments: [] };
}

export function saveDebtData(data: DebtData): void {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verdant:debt:updated"));
    }
    pushBlobInBackground(BLOB_KEY, data);
  } catch (e) {
    console.warn("[DebtStore] save failed:", e);
  }
}

/** Pull from Supabase and overwrite local. Call on boot / household switch. */
export async function hydrateDebtFromRemote(): Promise<boolean> {
  const remote = await pullBlob<DebtData>(BLOB_KEY);
  if (!remote) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("verdant:debt:updated"));
    }
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

export function getDebtSummary(data?: DebtData): DebtSummary {
  const d = data ?? loadDebtData();

  const activeLoans = d.loans.filter(isLoanActive);
  const activeInstallments = d.installments.filter(isInstallmentActive);
  const mortgageTracks = d.mortgage?.tracks || [];

  const mortgageMonthly = mortgageTracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  const loansMonthly = activeLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const installmentsMonthly = activeInstallments.reduce((s, i) => s + (i.monthlyAmount || 0), 0);

  const mortgageBalance = mortgageTracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const loansBalance = activeLoans.reduce((s, l) => {
    const remain = Math.max(0, l.totalPayments - loanElapsedMonths(l.startDate));
    return s + remain * (l.monthlyPayment || 0);
  }, 0);

  // Weighted average mortgage interest
  const totalMortgageOrig = mortgageTracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
  const mortgageAvgInterest =
    totalMortgageOrig > 0
      ? mortgageTracks.reduce((s, t) => s + (t.interestRate || 0) * (t.originalAmount || 0), 0) /
        totalMortgageOrig
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
  rate_pct: number;
  monthly_payment: number;
}

export function getDebtAsLiabilities(): LiabilitySummaryRow[] {
  const d = loadDebtData();
  const rows: LiabilitySummaryRow[] = [];

  // Mortgage — single aggregated row
  const tracks = d.mortgage?.tracks || [];
  if (tracks.length > 0) {
    const totalBalance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
    const totalMonthly = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
    const totalOrig = tracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
    const avgRate =
      totalOrig > 0
        ? tracks.reduce((s, t) => s + (t.interestRate || 0) * (t.originalAmount || 0), 0) /
          totalOrig
        : 0;
    rows.push({
      id: "debt-mortgage",
      name: d.mortgage?.bank ? `משכנתא — ${d.mortgage.bank}` : "משכנתא",
      liability_group: "mortgage",
      balance: totalBalance,
      rate_pct: avgRate,
      monthly_payment: totalMonthly,
    });
  }

  // Loans
  const activeLoans = d.loans.filter(isLoanActive);
  for (const l of activeLoans) {
    const remain = Math.max(0, l.totalPayments - loanElapsedMonths(l.startDate));
    rows.push({
      id: `debt-loan-${l.id}`,
      name: l.lender || "הלוואה",
      liability_group: "loans",
      balance: remain * (l.monthlyPayment || 0),
      rate_pct: 0, // Rate not stored per loan in current model
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
