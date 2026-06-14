/**
 * AllocationPie — generic donut chart for portfolio allocation views.
 *
 * Used by /pension (3 cuts: type, risk, geography), /investments (kind, geo),
 * and /balance (overall exposure summary). Replaces the older AssetDonut by
 * supporting:
 *   - title + center label (e.g., total ₪)
 *   - empty state hint
 *   - missing-data tail slice (auto-calculated from props)
 *   - click-through callback
 *
 * Built 2026-04-28 per Nir's request: "עוגות במקום קווים, בכל עמוד עם השקעות".
 */

import { useState } from "react";
import { fmtILS } from "@/lib/format";

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  pct: number; // 0..100
  color: string;
  tooltip?: string;
}

interface Props {
  title: string;
  slices: PieSlice[];
  /** Big number to render in the donut center. Defaults to total ₪. */
  centerLabel?: string;
  /** Empty-state copy (when slices.length === 0). */
  emptyHint?: string;
  size?: "sm" | "md" | "lg";
  onSliceClick?: (key: string) => void;
  tooltipForSlice?: (slice: PieSlice) => string;
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 120,
  md: 150,
  lg: 180,
};

export function AllocationPie({
  title,
  slices,
  centerLabel,
  emptyHint = "אין נתונים",
  size = "md",
  onSliceClick,
  tooltipForSlice,
}: Props) {
  const [hoveredSlice, setHoveredSlice] = useState<PieSlice | null>(null);
  const px = SIZE_PX[size];
  const total = slices.reduce((s, x) => s + x.value, 0);
  const center = centerLabel ?? (total > 0 ? fmtILS(total) : "—");
  const defaultTooltip = (s: PieSlice) =>
    s.tooltip ?? `${s.label}: ${fmtILS(s.value)} (${s.pct.toFixed(1)}% מהתיק)`;

  if (!slices.length || total === 0) {
    return (
      <div className="card-pad">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
          {title}
        </div>
        <div className="flex items-center justify-center py-8 text-sm text-verdant-muted">
          {emptyHint}
        </div>
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="card-pad">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        {title}
      </div>

      <div className="relative mb-4 flex items-center justify-center" style={{ minHeight: px }}>
        <svg width={px} height={px} viewBox="0 0 42 42" className="-rotate-90">
          <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#E5E7EB" strokeWidth="5" />
          {slices.map((s, i) => {
            const tooltip = tooltipForSlice?.(s) ?? defaultTooltip(s);
            const el = (
              <circle
                key={s.key + i}
                cx="21"
                cy="21"
                r="15.9155"
                fill="transparent"
                stroke={s.color}
                strokeWidth="5"
                strokeDasharray={`${s.pct} ${100 - s.pct}`}
                strokeDashoffset={-offset}
                style={{ cursor: onSliceClick ? "pointer" : "default" }}
                onClick={onSliceClick ? () => onSliceClick(s.key) : undefined}
                onMouseEnter={() => setHoveredSlice(s)}
                onMouseLeave={() => setHoveredSlice(null)}
                onFocus={() => setHoveredSlice(s)}
                onBlur={() => setHoveredSlice(null)}
                aria-label={tooltip}
                tabIndex={0}
              />
            );
            offset += s.pct;
            return el;
          })}
        </svg>
        {hoveredSlice && (
          <div
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-64 -translate-x-1/2 translate-y-14 rounded-md border border-[#DDE5DD] bg-white p-3 text-right text-[11px] font-semibold leading-5 text-verdant-ink shadow-lg"
          >
            {(tooltipForSlice?.(hoveredSlice) ?? defaultTooltip(hoveredSlice))
              .split("\n")
              .map((line, i) => (
                <div key={i}>{line}</div>
              ))}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
            סה״כ
          </div>
          <div className="text-base font-extrabold tabular-nums text-verdant-ink">{center}</div>
        </div>
      </div>

      <ul className="space-y-1.5 text-xs">
        {slices.map((s) => (
          <li
            key={s.key}
            className="flex items-center justify-between"
            style={{ cursor: onSliceClick ? "pointer" : "default" }}
            onClick={onSliceClick ? () => onSliceClick(s.key) : undefined}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="truncate font-semibold text-verdant-ink">{s.label}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] tabular-nums text-verdant-muted">{fmtILS(s.value)}</span>
              <span className="w-9 text-left font-extrabold tabular-nums text-verdant-ink">
                {Math.round(s.pct)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
