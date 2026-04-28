/**
 * Pension allocation aggregator — converts a list of PensionFund[] into
 * the 3 pie cuts that /pension shows: by type, by risk level, by geography.
 *
 * Built 2026-04-28 for the redesign Nir asked for ("שלוש עוגות").
 *
 * Coverage strategy:
 *  - Funds with `registeredFundId` → take real geo/risk from FUND_REGISTRY
 *  - Funds without → fall back to "לא מזוהה" slice with full balance
 *
 * Currency reminder: balance numbers are ILS (NIS).
 */

import type { PensionFund } from "./pension-store";
import { getFundById } from "./fund-registry";
import type { PieSlice } from "@/components/charts/AllocationPie";

const TYPE_LABEL: Record<PensionFund["type"], string> = {
  pension:    "פנסיה",
  hishtalmut: "השתלמות",
  gemel:      "גמל",
  bituach:    "ביטוח מנהלים",
};

const TYPE_COLOR: Record<PensionFund["type"], string> = {
  pension:    "#1B4332",
  hishtalmut: "#2B694D",
  gemel:      "#4A8F6F",
  bituach:    "#7FA68D",
};

const RISK_LABEL = {
  equity:      "מנייתי",
  bonds:       "אג״ח",
  cash:        "מזומן",
  alternative: "אלטרנטיבי",
  unknown:     "לא מזוהה",
} as const;

const RISK_COLOR = {
  equity:      "#7C2D12", // deep red — high risk
  bonds:       "#1E3A8A", // deep blue — defensive
  cash:        "#0F766E", // teal — cash
  alternative: "#6B21A8", // purple
  unknown:     "#94a3b8", // gray
};

const GEO_LABEL = {
  IL:    "ישראל",
  US:    "ארה״ב",
  EU:    "אירופה",
  EM:    "שווקים מתעוררים",
  OTHER: "אחר",
  unknown: "לא מזוהה",
} as const;

const GEO_COLOR = {
  IL:    "#1B4332",
  US:    "#0F766E",
  EU:    "#7C2D12",
  EM:    "#B45309",
  OTHER: "#6B21A8",
  unknown: "#94a3b8",
};

export interface PensionAllocations {
  byType: PieSlice[];
  byRisk: PieSlice[];
  byGeo: PieSlice[];
  /** ₪ value of funds without `registeredFundId` (geo/risk pies show as "לא מזוהה"). */
  missingCoverage: number;
  /** ₪ total across all funds. */
  total: number;
}

const sortByValue = (a: PieSlice, b: PieSlice) => b.value - a.value;

/** Build the 3 pies. Returns empty arrays for sections with no data. */
export function buildPensionAllocations(funds: PensionFund[]): PensionAllocations {
  const total = funds.reduce((s, f) => s + (f.balance || 0), 0);

  // ── 1. By type ──
  const typeAcc: Partial<Record<PensionFund["type"], number>> = {};
  for (const f of funds) {
    typeAcc[f.type] = (typeAcc[f.type] || 0) + (f.balance || 0);
  }
  const byType: PieSlice[] = (Object.keys(typeAcc) as PensionFund["type"][])
    .filter((k) => (typeAcc[k] || 0) > 0)
    .map((k) => ({
      key: k,
      label: TYPE_LABEL[k],
      value: typeAcc[k] || 0,
      pct: total > 0 ? ((typeAcc[k] || 0) / total) * 100 : 0,
      color: TYPE_COLOR[k],
    }))
    .sort(sortByValue);

  // ── 2. By risk (asset class) — needs fund-registry coverage ──
  // Drill-down: when a fund has `tracks[]` (Mislaka multi-track product),
  // each track contributes independently with its own balance + registry
  // match. Falls back to top-level `registeredFundId` for single-track funds.
  const riskAcc: Record<keyof typeof RISK_LABEL, number> = {
    equity: 0, bonds: 0, cash: 0, alternative: 0, unknown: 0,
  };
  let missingCoverage = 0;
  for (const f of funds) {
    const totalBalance = f.balance || 0;
    if (!totalBalance) continue;

    // Per-track decomposition when present
    const tracks = (f.tracks && f.tracks.length > 0)
      ? f.tracks
      : [{ name: f.track || "", balance: totalBalance, registeredFundId: f.registeredFundId }];

    for (const t of tracks) {
      const tb = t.balance || 0;
      if (!tb) continue;
      const reg = t.registeredFundId ? getFundById(t.registeredFundId) : undefined;
      if (!reg) {
        riskAcc.unknown += tb;
        missingCoverage += tb;
        continue;
      }
      const ac = reg.allocation.assetClass;
      riskAcc.equity      += tb * (ac.equity      / 100);
      riskAcc.bonds       += tb * (ac.bonds       / 100);
      riskAcc.cash        += tb * (ac.cash        / 100);
      riskAcc.alternative += tb * (ac.alternative / 100);
    }
  }
  const byRisk: PieSlice[] = (Object.keys(riskAcc) as Array<keyof typeof RISK_LABEL>)
    .filter((k) => riskAcc[k] > 0.5) // hide noise slices < ₪0.5
    .map((k) => ({
      key: k,
      label: RISK_LABEL[k],
      value: riskAcc[k],
      pct: total > 0 ? (riskAcc[k] / total) * 100 : 0,
      color: RISK_COLOR[k],
    }))
    .sort(sortByValue);

  // ── 3. By geography (per-track) ──
  const geoAcc: Record<keyof typeof GEO_LABEL, number> = {
    IL: 0, US: 0, EU: 0, EM: 0, OTHER: 0, unknown: 0,
  };
  for (const f of funds) {
    const totalBalance = f.balance || 0;
    if (!totalBalance) continue;
    const tracks = (f.tracks && f.tracks.length > 0)
      ? f.tracks
      : [{ name: f.track || "", balance: totalBalance, registeredFundId: f.registeredFundId }];

    for (const t of tracks) {
      const tb = t.balance || 0;
      if (!tb) continue;
      const reg = t.registeredFundId ? getFundById(t.registeredFundId) : undefined;
      if (!reg) {
        geoAcc.unknown += tb;
        continue;
      }
      const g = reg.allocation.geography;
      geoAcc.IL    += tb * (g.IL    / 100);
      geoAcc.US    += tb * (g.US    / 100);
      geoAcc.EU    += tb * (g.EU    / 100);
      geoAcc.EM    += tb * (g.EM    / 100);
      geoAcc.OTHER += tb * (g.OTHER / 100);
    }
  }
  const byGeo: PieSlice[] = (Object.keys(geoAcc) as Array<keyof typeof GEO_LABEL>)
    .filter((k) => geoAcc[k] > 0.5)
    .map((k) => ({
      key: k,
      label: GEO_LABEL[k],
      value: geoAcc[k],
      pct: total > 0 ? (geoAcc[k] / total) * 100 : 0,
      color: GEO_COLOR[k],
    }))
    .sort(sortByValue);

  return { byType, byRisk, byGeo, missingCoverage, total };
}
