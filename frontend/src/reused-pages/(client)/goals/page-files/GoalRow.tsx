"use client";

import { useMemo, useEffect, useState } from "react";
import type { Bucket } from "@/lib/buckets-store";
import type { BucketProjection, BucketRecommendation } from "@shared/buckets-rebalancing";
import type { AssetType } from "@/lib/asset-goal-linking";
import { fmtILS } from "@/lib/format";
import { scopedKey } from "@/lib/client-scope";
import { getMonthlyNetIncome } from "@/lib/income";
import { SCOPE_LABELS, SCOPE_COLORS } from "@/lib/scope-types";
import { formatDate, formatYears, INSTRUMENTS, STATUS_COLOR, STATUS_LABEL } from "./shared";

interface GoalRowProps {
  bucket: Bucket;
  proj: BucketProjection;
  breakdown?: Record<AssetType, number>;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCoverageChange: (months: 3 | 4 | 5 | 6, newTarget: number) => void;
}

export function GoalRow({
  bucket,
  proj,
  breakdown,
  expanded,
  onToggle,
  onEdit,
  onCoverageChange,
}: GoalRowProps) {
  const statusColor = STATUS_COLOR[proj.status];
  const statusLabel = STATUS_LABEL[proj.status];
  const inst = bucket.fundingSource ? INSTRUMENTS[bucket.fundingSource] : null;

  return (
    <div
      className="overflow-hidden rounded-xl transition-all"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-[#FAFAF7]"
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "#ecfdf5" }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
            {bucket.icon}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-extrabold text-verdant-ink">
              {bucket.name}
            </span>
            {(bucket.scope === "business" || bucket.scope === "mixed") && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  background: `${SCOPE_COLORS[bucket.scope]}20`,
                  color: SCOPE_COLORS[bucket.scope],
                }}
              >
                {SCOPE_LABELS[bucket.scope]}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-verdant-muted">
            <span className="tabular-nums">{fmtILS(bucket.targetAmount)}</span>
            <span>·</span>
            <span>
              {formatDate(bucket.targetDate)} · בעוד {formatYears(proj.monthsRemaining)}
            </span>
          </div>
        </div>

        <div className="hidden w-40 shrink-0 md:block">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold tabular-nums text-verdant-muted">
            <span>{proj.progressPct}%</span>
            <span>
              {fmtILS(Math.round(bucket.currentAmount))} / {fmtILS(bucket.targetAmount)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#F3F4F6" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${proj.progressPct}%`,
                background: `linear-gradient(90deg, ${statusColor}AA, ${statusColor})`,
              }}
            />
          </div>
        </div>

        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
          style={{ background: `${statusColor}15`, color: statusColor }}
        >
          {statusLabel}
        </span>

        <span
          className="material-symbols-outlined shrink-0 text-[18px] text-verdant-muted transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>

      <div className="px-4 pb-3 md:hidden">
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold tabular-nums text-verdant-muted">
          <span>{proj.progressPct}%</span>
          <span>
            {fmtILS(Math.round(bucket.currentAmount))} / {fmtILS(bucket.targetAmount)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${proj.progressPct}%`,
              background: `linear-gradient(90deg, ${statusColor}AA, ${statusColor})`,
            }}
          />
        </div>
      </div>

      {expanded && (
        <ExpandedDetails
          bucket={bucket}
          proj={proj}
          breakdown={breakdown}
          inst={inst}
          onEdit={onEdit}
          onCoverageChange={onCoverageChange}
        />
      )}
    </div>
  );
}

function ExpandedDetails({
  bucket,
  proj,
  breakdown,
  inst,
  onEdit,
  onCoverageChange,
}: {
  bucket: Bucket;
  proj: BucketProjection;
  breakdown?: Record<AssetType, number>;
  inst: { label: string; rate: number; horizon: string; taxNote: string; category: string } | null;
  onEdit: () => void;
  onCoverageChange: (months: 3 | 4 | 5 | 6, newTarget: number) => void;
}) {
  const requiredAboveCurrent = proj.requiredMonthly > bucket.monthlyContribution;
  const initialCash = bucket.initialCash ?? 0;
  const linkedTotal = breakdown
    ? breakdown.security + breakdown.realestate + breakdown.pension + breakdown.cash
    : 0;

  const sourceItems = useMemo(() => {
    const out: { label: string; icon: string; value: number; color: string }[] = [];
    if (!breakdown) return out;
    if (breakdown.security > 0)
      out.push({ label: "שוק ההון", icon: "candlestick_chart", value: breakdown.security, color: "#2C7A5A" });
    if (breakdown.realestate > 0)
      out.push({ label: "נדל״ן", icon: "home_work", value: breakdown.realestate, color: "#B45309" });
    if (breakdown.pension > 0)
      out.push({ label: "פנסיה", icon: "elderly", value: breakdown.pension, color: "#059669" });
    if (breakdown.cash > 0)
      out.push({ label: "מזומן", icon: "account_balance_wallet", value: breakdown.cash, color: "#4A7C59" });
    return out;
  }, [breakdown]);

  return (
    <div className="border-t px-4 py-4" style={{ borderColor: "#E5E7EB" }}>
      {bucket.isEmergency && (
        <EmergencyCoverage bucket={bucket} onCoverageChange={onCoverageChange} />
      )}

      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl md:grid-cols-4"
        style={{ background: "#EEF0EC", border: "1px solid #E5E7EB" }}
      >
        <KpiCell
          label="הפקדה חודשית"
          value={fmtILS(bucket.monthlyContribution)}
          muted={bucket.monthlyContribution === 0}
        />
        <KpiCell
          label="נדרש בחודש"
          value={fmtILS(Math.round(proj.requiredMonthly))}
          valueColor={requiredAboveCurrent ? "#B45309" : "#2C7A5A"}
        />
        <KpiCell label="מכשיר" value={inst?.label || "—"} small muted={!inst?.label} />
        <KpiCell
          label={
            proj.effectiveAnnualReturn === bucket.expectedAnnualReturn
              ? "תשואה צפויה"
              : "תשואה בפועל"
          }
          value={`${(proj.effectiveAnnualReturn * 100).toFixed(1)}%`}
        />
      </div>

      {(initialCash > 0 || linkedTotal > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-verdant-muted">
          {initialCash > 0 && (
            <span>
              • {fmtILS(Math.round(initialCash))} מזומן
            </span>
          )}
          {sourceItems.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1"
              style={{ color: item.color }}
            >
              <span className="material-symbols-outlined text-[12px]">{item.icon}</span>
              {item.label}: {fmtILS(Math.round(item.value))}
            </span>
          ))}
        </div>
      )}

      {proj.recommendation.type !== "on_track" && (
        <div className="mt-3">
          <RecommendationCard rec={proj.recommendation} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all"
          style={{ background: "#FAFAF7", color: "#2C7A5A" }}
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
          ערוך מטרה
        </button>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  valueColor,
  small,
  muted,
}: {
  label: string;
  value: string;
  valueColor?: string;
  small?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="mb-1 text-[10px] font-bold text-verdant-muted">{label}</div>
      <div
        className={`font-extrabold tabular-nums ${small ? "text-[12px]" : "text-[14px]"}`}
        style={{ color: valueColor || (muted ? "#9CA3AF" : "var(--verdant-ink)") }}
      >
        {value}
      </div>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: BucketRecommendation }) {
  const bgMap: Record<string, string> = {
    free_up: "#ecfdf5",
    increase: "rgba(251,191,36,0.08)",
    extend_date: "#EFF6FF",
    reach_now: "#ecfdf5",
  };
  const borderMap: Record<string, string> = {
    free_up: "#2C7A5A33",
    increase: "#f59e0b33",
    extend_date: "#2563eb33",
    reach_now: "#2C7A5A33",
  };
  const textMap: Record<string, string> = {
    free_up: "#065f46",
    increase: "#92400e",
    extend_date: "#1e40af",
    reach_now: "#065f46",
  };

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: bgMap[rec.type] || "#FAFAF7",
        border: `1px solid ${borderMap[rec.type] || "#E5E7EB"}`,
      }}
    >
      <div className="mb-1 text-[11px] font-extrabold" style={{ color: textMap[rec.type] }}>
        {rec.title}
      </div>
      <div className="text-[10px] font-bold leading-relaxed" style={{ color: textMap[rec.type] }}>
        {rec.message}
      </div>
    </div>
  );
}

function EmergencyCoverage({
  bucket,
  onCoverageChange,
}: {
  bucket: Bucket;
  onCoverageChange: (months: 3 | 4 | 5 | 6, newTarget: number) => void;
}) {
  const monthlyIncome = getMonthlyNetIncome();
  const months = bucket.coverageMonths || 3;
  const setCoverage = (m: number) => {
    const clamped = Math.max(3, Math.min(6, Math.round(m))) as 3 | 4 | 5 | 6;
    const newTarget =
      monthlyIncome > 0 ? Math.round(monthlyIncome * clamped) : bucket.targetAmount;
    onCoverageChange(clamped, newTarget);
  };

  // Read liquid cash from localStorage AFTER mount — SSR has no localStorage
  // so the render-path read would yield 0 on the server and a real number on
  // the client → hydration mismatch. Defer to useEffect. accounts-store schema
  // uses `balance`, not `currentBalance`.
  const [liquid, setLiquid] = useState(0);
  useEffect(() => {
    const compute = () => {
      try {
        const raw = localStorage.getItem(scopedKey("verdant:accounts"));
        if (!raw) {
          setLiquid(0);
          return;
        }
        const parsed = JSON.parse(raw);
        const banks = parsed?.banks || [];
        const total = banks.reduce(
          (s: number, b: { balance?: number }) => s + (b.balance || 0),
          0,
        );
        setLiquid(total);
      } catch {
        setLiquid(0);
      }
    };
    compute();
    // Keep in sync when accounts change in other tabs/pages.
    const handler = () => compute();
    window.addEventListener("verdant:accounts:updated", handler);
    return () => window.removeEventListener("verdant:accounts:updated", handler);
  }, []);
  const gap = Math.max(0, bucket.targetAmount - liquid);

  return (
    <div className="mb-4 space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold text-verdant-muted">כיסוי</span>
          <span className="text-[12px] font-extrabold tabular-nums text-verdant-ink">
            {months} חודשים
            {monthlyIncome > 0 && (
              <span className="mr-2 text-[10px] font-medium text-verdant-muted">
                · {fmtILS(monthlyIncome)} × {months}
              </span>
            )}
          </span>
        </div>
        <input
          type="range"
          min={3}
          max={6}
          step={1}
          value={months}
          onChange={(e) => setCoverage(parseInt(e.target.value))}
          className="h-1.5 w-full accent-[#2C7A5A]"
        />
        <div className="mt-0.5 flex items-center justify-between px-0.5 text-[9px] text-verdant-muted">
          <span>3</span>
          <span>4</span>
          <span>5</span>
          <span>6</span>
        </div>
      </div>
      <div
        className="rounded-lg p-2.5"
        style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
      >
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-verdant-muted">
            נזיל בעו״ש <b className="tabular-nums text-verdant-ink">{fmtILS(liquid)}</b>
          </span>
          <span style={{ color: gap === 0 ? "#2C7A5A" : "#B45309" }}>
            {gap === 0 ? "מכוסה ✓" : `חסר ${fmtILS(gap)}`}
          </span>
        </div>
      </div>
    </div>
  );
}
