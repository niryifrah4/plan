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

import { fmtILS } from "@/lib/format";

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  pct: number;     // 0..100
  color: string;
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
}: Props) {
  const px = SIZE_PX[size];
  const total = slices.reduce((s, x) => s + x.value, 0);
  const center = centerLabel ?? (total > 0 ? fmtILS(total) : "—");

  if (!slices.length || total === 0) {
    return (
      <div className="card-pad">
        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">
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
      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">
        {title}
      </div>

      <div className="flex items-center justify-center mb-4 relative" style={{ minHeight: px }}>
        <svg width={px} height={px} viewBox="0 0 42 42" className="-rotate-90">
          <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#eef2e8" strokeWidth="5" />
          {slices.map((s, i) => {
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
              />
            );
            offset += s.pct;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold">
            סה״כ
          </div>
          <div className="text-base font-extrabold text-verdant-ink tabular-nums">
            {center}
          </div>
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
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-verdant-ink font-semibold truncate">{s.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-verdant-muted tabular-nums">{fmtILS(s.value)}</span>
              <span className="text-verdant-ink font-extrabold tabular-nums w-9 text-left">
                {Math.round(s.pct)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
