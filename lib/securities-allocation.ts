/**
 * Securities allocation aggregator — converts SecurityRow[] into pies for
 * /investments and the global exposure block on /balance.
 *
 * Built 2026-04-28 per Nir's redesign brief ("עוגות במקום קווים").
 *
 * NOTE on geography: the SecurityRow schema has no `geography` field.
 * We use `currency` as a proxy:
 *   ILS → ישראל, USD → ארה״ב, EUR → אירופה, else → אחר.
 * Imperfect (a US-listed ETF tracking emerging markets is still USD), but
 * a useful heuristic until the schema gets a real `geography` column.
 */

import type { SecurityRow } from "./securities-store";
import type { PieSlice } from "@/components/charts/AllocationPie";
import type { FundAllocation } from "./fund-registry";

const KIND_LABEL: Record<string, string> = {
  rsu: "RSU",
  option: "אופציות",
  espp: "ESPP",
  stock: "מניה",
  etf: "ETF",
  bond: "אג״ח",
  crypto: "קריפטו",
  fund: "קרן",
  other: "אחר",
};

const KIND_COLOR: Record<string, string> = {
  rsu: "#1B4332",
  option: "#2B694D",
  espp: "#4A8F6F",
  stock: "#7C2D12",
  etf: "#0F766E",
  bond: "#1E3A8A",
  crypto: "#B45309",
  fund: "#6B21A8",
  other: "#6b7280",
};

const CURRENCY_TO_GEO_LABEL: Record<string, string> = {
  ILS: "ישראל",
  NIS: "ישראל",
  USD: "ארה״ב",
  EUR: "אירופה",
  GBP: "בריטניה",
};

const GEO_COLOR_BY_LABEL: Record<string, string> = {
  ישראל: "#1B4332",
  "ארה״ב": "#0F766E",
  אירופה: "#7C2D12",
  בריטניה: "#6B21A8",
  אחר: "#6b7280",
};

export interface SecuritiesAllocations {
  byKind: PieSlice[];
  byGeo: PieSlice[];
  total: number;
}

/**
 * Build a per-row FundAllocation from a single SecurityRow.
 *
 * Used by the multi-dimensional allocation engine on /balance so that a
 * security gets correctly classified by its actual currency + kind rather
 * than being defaulted to `us_stock` (100% USD / US / equity).
 *
 * Currency:    100% in the row's currency (ILS / USD / EUR / OTHER bucket)
 * Geography:   currency as a proxy — same heuristic as `buildSecuritiesAllocations`
 * Asset class: kind → equity / bonds / alternative (RSU/option/ESPP count as equity)
 * Liquidity:   `immediate` (publicly-traded securities settle T+1-T+3)
 */
const STOCK_KINDS = new Set(["stock", "etf", "rsu", "option", "espp"]);
const BOND_KINDS = new Set(["bond"]);
const ALT_KINDS = new Set(["crypto", "fund", "other"]);

export function securityToAllocation(sec: SecurityRow): FundAllocation {
  const currency = (sec.currency || "ILS").toUpperCase();
  const kind = (sec.kind || "stock").toLowerCase();

  // Currency vector — 100% in the row's denomination
  const currencyVec = { ILS: 0, USD: 0, EUR: 0, OTHER: 0 };
  if (currency === "ILS" || currency === "NIS") currencyVec.ILS = 100;
  else if (currency === "USD") currencyVec.USD = 100;
  else if (currency === "EUR") currencyVec.EUR = 100;
  else currencyVec.OTHER = 100;

  // Geography vector — currency as a proxy. A USD-denominated EM ETF will
  // still land in US here; this matches `buildSecuritiesAllocations`.
  const geoVec = { IL: 0, US: 0, EU: 0, EM: 0, OTHER: 0 };
  if (currency === "ILS" || currency === "NIS") geoVec.IL = 100;
  else if (currency === "USD") geoVec.US = 100;
  else if (currency === "EUR") geoVec.EU = 100;
  else geoVec.OTHER = 100;

  // Asset class — by kind
  const classVec = { equity: 0, bonds: 0, cash: 0, alternative: 0 };
  if (STOCK_KINDS.has(kind)) classVec.equity = 100;
  else if (BOND_KINDS.has(kind)) classVec.bonds = 100;
  else if (ALT_KINDS.has(kind)) classVec.alternative = 100;
  else classVec.equity = 100; // sensible default for unknown kinds

  return {
    currency: currencyVec,
    geography: geoVec,
    assetClass: classVec,
    liquidity: "immediate",
  };
}

const sortByValue = (a: PieSlice, b: PieSlice) => b.value - a.value;

export function buildSecuritiesAllocations(rows: SecurityRow[]): SecuritiesAllocations {
  const total = rows.reduce((s, r) => s + (r.market_value_ils || 0), 0);

  // ── By kind ──
  const kindAcc = new Map<string, number>();
  for (const r of rows) {
    const k = (r.kind || "other").toLowerCase();
    kindAcc.set(k, (kindAcc.get(k) || 0) + (r.market_value_ils || 0));
  }
  const byKind: PieSlice[] = Array.from(kindAcc.entries())
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      key: k,
      label: KIND_LABEL[k] || k,
      value: v,
      pct: total > 0 ? (v / total) * 100 : 0,
      color: KIND_COLOR[k] || "#6b7280",
    }))
    .sort(sortByValue);

  // ── By geography (currency proxy) ──
  const geoAcc = new Map<string, number>();
  for (const r of rows) {
    const cur = (r.currency || "").toUpperCase();
    const label = CURRENCY_TO_GEO_LABEL[cur] || "אחר";
    geoAcc.set(label, (geoAcc.get(label) || 0) + (r.market_value_ils || 0));
  }
  const byGeo: PieSlice[] = Array.from(geoAcc.entries())
    .filter(([, v]) => v > 0)
    .map(([label, v]) => ({
      key: label,
      label,
      value: v,
      pct: total > 0 ? (v / total) * 100 : 0,
      color: GEO_COLOR_BY_LABEL[label] || "#6b7280",
    }))
    .sort(sortByValue);

  return { byKind, byGeo, total };
}
