/**
 * Pension allocation aggregator.
 *
 * Important: charts produced here use only explicit data that arrived from the
 * uploaded report/XML or from the product record itself. No risk/geography
 * inference from track names.
 */

import type { PieSlice } from "@/components/charts/AllocationPie";
import type { PensionFund } from "./pension-store";

const TYPE_LABEL: Record<PensionFund["type"], string> = {
  pension: "פנסיה",
  hishtalmut: "השתלמות",
  gemel: "גמל",
  bituach: "ביטוח מנהלים",
};

const TYPE_COLOR: Record<PensionFund["type"], string> = {
  pension: "#1B4332",
  hishtalmut: "#2B694D",
  gemel: "#4A8F6F",
  bituach: "#7FA68D",
};

const TRACK_COLORS = ["#1B4332", "#0F766E", "#7C2D12", "#B45309", "#6B21A8", "#4B5563"];

export interface PensionAllocations {
  byType: PieSlice[];
  byTrack: PieSlice[];
  byRisk: PieSlice[];
  byGeo: PieSlice[];
  /** Kept for older page warning logic; report-only charts do not use inferred coverage. */
  missingCoverage: number;
  total: number;
}

const sortByValue = (a: PieSlice, b: PieSlice) => b.value - a.value;

type TrackInput = {
  name: string;
  balance: number;
  annualReturnPct?: number;
  return5yPct?: number;
  mgmtFeeDepositPct?: number;
  mgmtFeeBalancePct?: number;
  investmentExpensePct?: number;
};

function formatPct(value: number | undefined): string | null {
  return typeof value === "number" ? `${value.toFixed(2)}%` : null;
}

function getReportTracks(fund: PensionFund): TrackInput[] {
  const totalBalance = fund.balance || 0;
  if (!totalBalance) return [];

  if (fund.tracks && fund.tracks.length > 0) {
    return fund.tracks
      .filter((t) => (t.balance || 0) > 0)
      .map((t) => ({
        name: t.name || fund.track || "מסלול ללא שם",
        balance: t.balance || 0,
        annualReturnPct: t.returnPct,
      }));
  }

  const reportTracks = fund.annualReportDetails?.investmentTracks;
  const withBalance = (reportTracks || []).filter((t) => (t.balance || 0) > 0);
  if (withBalance.length > 0) {
    return withBalance.map((t) => ({
      name: t.name || fund.track || "מסלול ללא שם",
      balance: t.balance || 0,
      annualReturnPct: t.annualReturnPct,
      return5yPct: t.return5yPct,
      mgmtFeeDepositPct: t.mgmtFeeDepositPct,
      mgmtFeeBalancePct: t.mgmtFeeBalancePct,
      investmentExpensePct: t.investmentExpensePct,
    }));
  }

  // Fallback: report gave a track NAME but no per-track balance breakdown
  // (e.g. Harel's short annual/quarterly summary). Attribute the fund's whole
  // balance to its single named track so it isn't dropped from the "by track"
  // chart (which would otherwise show up as an unallocated grey wedge).
  const singleTrack = reportTracks?.[0];
  return [
    {
      name: fund.track || singleTrack?.name || "מסלול ללא שם",
      balance: totalBalance,
      annualReturnPct: singleTrack?.annualReturnPct,
      return5yPct: singleTrack?.return5yPct,
      mgmtFeeDepositPct: singleTrack?.mgmtFeeDepositPct,
      mgmtFeeBalancePct: singleTrack?.mgmtFeeBalancePct,
      investmentExpensePct: singleTrack?.investmentExpensePct,
    },
  ];
}

export function buildPensionAllocations(funds: PensionFund[]): PensionAllocations {
  const total = funds.reduce((s, f) => s + (f.balance || 0), 0);

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

  const trackAcc = new Map<string, TrackInput>();
  for (const fund of funds) {
    for (const track of getReportTracks(fund)) {
      const current = trackAcc.get(track.name) || { name: track.name, balance: 0 };
      current.balance += track.balance;
      current.annualReturnPct ??= track.annualReturnPct;
      current.return5yPct ??= track.return5yPct;
      current.mgmtFeeDepositPct ??= track.mgmtFeeDepositPct;
      current.mgmtFeeBalancePct ??= track.mgmtFeeBalancePct;
      current.investmentExpensePct ??= track.investmentExpensePct;
      trackAcc.set(track.name, current);
    }
  }

  const byTrack: PieSlice[] = Array.from(trackAcc.values())
    .map((track, index) => ({
      key: `track_${index}_${track.name}`,
      label: track.name,
      value: track.balance,
      pct: total > 0 ? (track.balance / total) * 100 : 0,
      color: TRACK_COLORS[index % TRACK_COLORS.length],
      tooltip: [
        `${track.name}: ${Math.round(track.balance).toLocaleString("he-IL")} ₪`,
        `חלק מהתיק: ${total > 0 ? ((track.balance / total) * 100).toFixed(1) : "0.0"}%`,
        formatPct(track.annualReturnPct) ? `תשואה שנתית בדוח: ${formatPct(track.annualReturnPct)}` : null,
        formatPct(track.return5yPct) ? `תשואה 5 שנים בדוח: ${formatPct(track.return5yPct)}` : null,
        formatPct(track.mgmtFeeBalancePct)
          ? `דמי ניהול מצבירה בדוח: ${formatPct(track.mgmtFeeBalancePct)}`
          : null,
        formatPct(track.mgmtFeeDepositPct)
          ? `דמי ניהול מהפקדה בדוח: ${formatPct(track.mgmtFeeDepositPct)}`
          : null,
        formatPct(track.investmentExpensePct)
          ? `הוצאות ניהול השקעות בדוח: ${formatPct(track.investmentExpensePct)}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    }))
    .sort(sortByValue);

  return { byType, byTrack, byRisk: [], byGeo: [], missingCoverage: 0, total };
}
