"use client";

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";

/**
 * Percentage donut for budget expense breakdown.
 * Feed it the expense rows; it draws a donut + legend with % per row
 * and highlights on hover. No recharts — pure SVG, matches system style.
 */

export interface BudgetPieSlice {
  label: string;
  value: number;
  color: string;
  /** Optional — tag so we know which section it belongs to (fixed/variable/business). */
  section?: "fixed" | "variable" | "business";
}

interface Props {
  slices: BudgetPieSlice[];
  /** Header title — defaults to "פיזור הוצאות". */
  title?: string;
  /** Subline below title. */
  subtitle?: string;
  /** Mode used for the big center number — "actual" or "budget". */
  mode?: "actual" | "budget";
}

/* ── Color palette used when the caller doesn't supply one ── */
export const BUDGET_PIE_COLORS = [
  "#1B4332",
  "#2B694D",
  "#1e6b3a",
  "#2B694D",
  "#34d399",
  "#d97706",
  "#f59e0b",
  "#fbbf24",
  "#fcd34d",
  "#b91c1c",
  "#dc2626",
  "#ef4444",
  "#f87171",
  "#1d4ed8",
  "#3b82f6",
  "#60a5fa",
  "#1B4332",
  "#a78bfa",
  "#C1ECD4",
  "#0891b2",
  "#06b6d4",
  "#22d3ee",
];

/* polar → cartesian for arc paths */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
) {
  const safeEnd = endAngle - startAngle >= 360 ? endAngle - 0.01 : endAngle;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, safeEnd);
  const p3 = polar(cx, cy, rInner, safeEnd);
  const p4 = polar(cx, cy, rInner, startAngle);
  const largeArc = safeEnd - startAngle > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

export default function BudgetPie({
  slices,
  title = "פיזור הוצאות",
  subtitle,
  mode = "actual",
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const cleaned = useMemo(
    () =>
      slices
        .map((s, i) => ({
          ...s,
          color: s.color || BUDGET_PIE_COLORS[i % BUDGET_PIE_COLORS.length],
        }))
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value),
    [slices]
  );

  const total = cleaned.reduce((sum, s) => sum + s.value, 0);

  /* Build arc segments */
  const segments = useMemo(() => {
    if (total <= 0) return [];
    let cursor = 0;
    return cleaned.map((s, i) => {
      const sweep = (s.value / total) * 360;
      const seg = {
        ...s,
        startAngle: cursor,
        endAngle: cursor + sweep,
        pct: (s.value / total) * 100,
        idx: i,
      };
      cursor += sweep;
      return seg;
    });
  }, [cleaned, total]);

  const CX = 130,
    CY = 130,
    R_OUT = 115,
    R_IN = 68;
  const hovered = hoverIdx !== null ? segments[hoverIdx] : null;

  return (
    <section
      className="relative mb-4 overflow-hidden rounded-2xl p-5 md:p-7"
      style={{
        background: "#f9faf2",
        border: "1px solid #e2e8d8",
        boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)",
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: "linear-gradient(90deg, #1B4332 0%, #2B694D 100%)" }}
      />

      <div className="mb-4 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "#1B433215", color: "#1B4332" }}
        >
          <span className="material-symbols-outlined text-[20px]">donut_large</span>
        </div>
        <div>
          <div className="text-base font-extrabold" style={{ color: "#012d1d" }}>
            {title}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
            {subtitle ??
              (mode === "actual"
                ? "כמה יצא באחוז על כל קטגוריה — בפועל"
                : "כמה תוכנן באחוז על כל קטגוריה")}
          </div>
        </div>
      </div>

      {total <= 0 ? (
        <div
          className="rounded-xl bg-white py-10 text-center"
          style={{ border: "1px dashed #e2e8d8" }}
        >
          <span className="material-symbols-outlined text-[36px]" style={{ color: "#5a7a6a" }}>
            pie_chart
          </span>
          <div className="mt-2 text-[13px] font-bold" style={{ color: "#012d1d" }}>
            אין עדיין הוצאות להצגה
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "#5a7a6a" }}>
            הזן סכומים בשורות התקציב כדי לראות פיזור אחוזי
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #eef2e8" }}>
          <div className="flex flex-wrap items-center gap-5 md:flex-nowrap">
            {/* ── Donut SVG ── */}
            <div className="relative shrink-0" style={{ width: 260, height: 260 }}>
              <svg width="260" height="260" viewBox="0 0 260 260">
                <defs>
                  <filter id="bp-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {segments.map((seg, i) => {
                  const isHover = hoverIdx === i;
                  const rOut = isHover ? R_OUT + 4 : R_OUT;
                  return (
                    <path
                      key={i}
                      d={arcPath(CX, CY, rOut, R_IN, seg.startAngle, seg.endAngle)}
                      fill={seg.color}
                      opacity={hoverIdx === null || isHover ? 1 : 0.35}
                      stroke="#ffffff"
                      strokeWidth="2"
                      style={{ cursor: "pointer", transition: "all 0.15s ease-out" }}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      filter={isHover ? "url(#bp-glow)" : undefined}
                    />
                  );
                })}
              </svg>

              {/* Center label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {hovered ? (
                  <>
                    <div
                      className="text-[10px] font-bold tracking-wide"
                      style={{ color: hovered.color }}
                    >
                      {hovered.label}
                    </div>
                    <div
                      className="mt-1 text-[28px] font-extrabold tabular-nums leading-none"
                      style={{ color: "#012d1d" }}
                    >
                      {hovered.pct.toFixed(1)}%
                    </div>
                    <div
                      className="mt-1 text-[11px] font-bold tabular-nums"
                      style={{ color: "#5a7a6a" }}
                    >
                      {fmtILS(hovered.value)}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className="text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: "#5a7a6a" }}
                    >
                      סך הכל
                    </div>
                    <div
                      className="mt-1 text-[24px] font-extrabold tabular-nums leading-none"
                      style={{ color: "#012d1d" }}
                    >
                      {fmtILS(total)}
                    </div>
                    <div className="mt-1 text-[10px] font-bold" style={{ color: "#5a7a6a" }}>
                      {cleaned.length} קטגוריות
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Legend with percentages ── */}
            <div className="min-w-0 flex-1">
              <div className="grid max-h-[260px] grid-cols-1 gap-1.5 overflow-y-auto pr-1">
                {segments.map((seg, i) => {
                  const isHover = hoverIdx === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-right transition-all"
                      style={{
                        background: isHover ? `${seg.color}12` : "transparent",
                        border: `1px solid ${isHover ? seg.color + "40" : "transparent"}`,
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: seg.color }}
                      />
                      <span
                        className="flex-1 truncate text-[12px] font-bold"
                        style={{ color: "#012d1d" }}
                      >
                        {seg.label}
                      </span>
                      <span
                        className="shrink-0 text-[11px] font-bold tabular-nums"
                        style={{ color: "#5a7a6a" }}
                      >
                        {fmtILS(seg.value)}
                      </span>
                      <span
                        className="w-[44px] shrink-0 text-left text-[11px] font-extrabold tabular-nums"
                        style={{ color: seg.color }}
                      >
                        {seg.pct.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
