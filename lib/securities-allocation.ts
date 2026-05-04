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
  other: "#94a3b8",
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
  אחר: "#94a3b8",
};

export interface SecuritiesAllocations {
  byKind: PieSlice[];
  byGeo: PieSlice[];
  total: number;
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
      color: KIND_COLOR[k] || "#94a3b8",
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
      color: GEO_COLOR_BY_LABEL[label] || "#94a3b8",
    }))
    .sort(sortByValue);

  return { byKind, byGeo, total };
}
