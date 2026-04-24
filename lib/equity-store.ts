/**
 * Equity Store — RSU & ESPP grant tracking.
 *
 * Each grant captures: company, ticker, type (RSU/ESPP/Options), total shares,
 * grant price, current share price, vesting start date + months, cliff, and
 * vesting frequency (monthly/quarterly).
 *
 * Per-client localStorage key: `verdant:equity_grants`.
 * Section 102 tax = 25% flat on capital gain at sale (standard route, >24mo held).
 */

import { scopedKey } from "@/lib/client-scope";

export type EquityType = "rsu" | "espp" | "options";

export interface EquityGrant {
  id: string;
  company: string;
  ticker?: string;
  type: EquityType;
  totalShares: number;
  /** For RSU: $0 (free). For options: strike price per share. For ESPP: effective purchase price. */
  grantPricePerShare: number;
  /** Current market price per share (manual update). */
  currentPricePerShare: number;
  /** Vesting start date (ISO yyyy-mm-dd). */
  vestStart: string;
  /** Total vesting period in months (e.g. 48). */
  vestMonths: number;
  /** Cliff period in months (e.g. 12). 0 = no cliff. */
  cliffMonths: number;
  /** Vesting frequency after cliff. */
  frequency: "monthly" | "quarterly";
  /** Currency — for display only, calcs assume USD→ILS at given rate. */
  currency: "USD" | "ILS";
  /** USD→ILS exchange rate used to compute ILS value. */
  usdIlsRate: number;
  /** Notes. */
  notes?: string;
}

const STORAGE_KEY = "verdant:equity_grants";
export const EQUITY_EVENT = "verdant:equity:updated";

export function loadGrants(): EquityGrant[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveGrants(grants: EquityGrant[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(grants));
    window.dispatchEvent(new Event(EQUITY_EVENT));
  } catch {}
}

/** Section 102 capital-gains tax rate (long-term, standard route). */
export const SECTION_102_TAX_RATE = 0.25;

/* ═══════════════════════════════════════════════════════════
   Computations
   ═══════════════════════════════════════════════════════════ */

export interface GrantValuation {
  grantId: string;
  /** Shares that have vested as of now. */
  vestedShares: number;
  unvestedShares: number;
  /** Current market value of vested shares (ILS). */
  vestedValueIls: number;
  /** Current market value of all shares (vested + unvested) at today's price. */
  totalValueIls: number;
  /** Gain vs grant price on vested shares (what matters for 102 tax). */
  gainIls: number;
  /** Estimated tax under §102 if sold today. */
  taxIls: number;
  /** Net after 102 tax. */
  netAfterTaxIls: number;
  /** % of the grant that has vested. */
  vestedPct: number;
}

function toIls(usd: number, rate: number) {
  return usd * (rate || 0);
}

export function computeVested(grant: EquityGrant, asOf: Date = new Date()): GrantValuation {
  const start = new Date(grant.vestStart);
  const now = asOf;
  const monthsElapsed = Math.max(0,
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth()) +
    (now.getDate() >= start.getDate() ? 0 : -1)
  );

  let vestedShares = 0;
  if (monthsElapsed >= grant.cliffMonths) {
    // Cliff clears — allocate per-frequency slices
    const totalSlices = grant.frequency === "quarterly" ? Math.floor(grant.vestMonths / 3) : grant.vestMonths;
    const monthsPerSlice = grant.frequency === "quarterly" ? 3 : 1;
    const slicesElapsed = Math.min(totalSlices, Math.floor(monthsElapsed / monthsPerSlice));
    vestedShares = Math.floor((grant.totalShares * slicesElapsed) / totalSlices);
  }

  vestedShares = Math.min(vestedShares, grant.totalShares);
  const unvestedShares = Math.max(0, grant.totalShares - vestedShares);

  const currentPriceIls =
    grant.currency === "USD" ? toIls(grant.currentPricePerShare, grant.usdIlsRate) : grant.currentPricePerShare;
  const grantPriceIls =
    grant.currency === "USD" ? toIls(grant.grantPricePerShare, grant.usdIlsRate) : grant.grantPricePerShare;

  const vestedValueIls = vestedShares * currentPriceIls;
  const totalValueIls = grant.totalShares * currentPriceIls;

  const costBasisIls = vestedShares * grantPriceIls;
  const gainIls = Math.max(0, vestedValueIls - costBasisIls);
  const taxIls = gainIls * SECTION_102_TAX_RATE;
  const netAfterTaxIls = vestedValueIls - taxIls;

  return {
    grantId: grant.id,
    vestedShares,
    unvestedShares,
    vestedValueIls,
    totalValueIls,
    gainIls,
    taxIls,
    netAfterTaxIls,
    vestedPct: grant.totalShares > 0 ? vestedShares / grant.totalShares : 0,
  };
}

export interface EquityPortfolioSummary {
  totalGrants: number;
  totalVestedValueIls: number;
  totalUnvestedValueIls: number;
  totalPortfolioValueIls: number;
  totalTaxOwedIfSoldIls: number;
  totalNetAfterTaxIls: number;
}

export function summarizePortfolio(grants: EquityGrant[]): EquityPortfolioSummary {
  let vested = 0, unvested = 0, tax = 0, net = 0;
  for (const g of grants) {
    const v = computeVested(g);
    vested += v.vestedValueIls;
    unvested += (v.unvestedShares) * (g.currency === "USD" ? g.currentPricePerShare * g.usdIlsRate : g.currentPricePerShare);
    tax += v.taxIls;
    net += v.netAfterTaxIls;
  }
  return {
    totalGrants: grants.length,
    totalVestedValueIls: vested,
    totalUnvestedValueIls: unvested,
    totalPortfolioValueIls: vested + unvested,
    totalTaxOwedIfSoldIls: tax,
    totalNetAfterTaxIls: net,
  };
}
