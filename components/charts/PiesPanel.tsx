"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  PiesPanel — N donut charts side by side
 * ═══════════════════════════════════════════════════════════
 *
 * Generic visualizer for "share of total" data. Used by /pension,
 * /investments, /dashboard wherever we need to show a portfolio split
 * across multiple dimensions (asset class / geography / currency /
 * fund type / risk level).
 *
 * Per CLAUDE.md: brand colors only, ₪ when relevant, RTL.
 *
 * Visual:
 *   • SVG donut, hole at center for the dominant slice's percentage
 *   • Legend below: small swatch + label + % (+ optional ₪)
 *   • Hovering a slice does NOT need interactivity — keep it static
 */

import type { ReactNode } from "react";

export interface PieSlice {
  /** Stable key for React. */
  key: string;
  /** Display label in Hebrew. */
  label: string;
  /** Hex color (brand palette only). */
  color: string;
  /** Percentage 0..100. */
  pct: number;
  /** Optional ILS amount for legend. Hide when too noisy. */
  ils?: number;
}

export interface PieDef {
  /** Section title (e.g. "אפיק", "גיאוגרפיה"). */
  title: string;
  /** Slices, in display order. Zero-pct slices are filtered. */
  slices: PieSlice[];
  /** Optional centered overlay (e.g. dominant label or total ILS). */
  centerLabel?: ReactNode;
}

export interface PiesPanelProps {
  pies: PieDef[];
  /** Diameter of each donut in px (default 160). */
  size?: number;
  /** Show ILS amount in legend (default false — only %). */
  showILS?: boolean;
  /** Compact mode — smaller donuts and tighter legend (for dashboard). */
  compact?: boolean;
}

const DEFAULT_SIZE = 160;
const COMPACT_SIZE = 120;

export function PiesPanel({ pies, size, showILS = false, compact = false }: PiesPanelProps) {
  const diameter = size ?? (compact ? COMPACT_SIZE : DEFAULT_SIZE);

  return (
    <div
      className={`grid gap-4 ${compact ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}
      dir="rtl"
    >
      {pies.map((pie, i) => (
        <Donut key={i} pie={pie} size={diameter} showILS={showILS} compact={compact} />
      ))}
    </div>
  );
}

/* ─── Donut component ─── */

function Donut({
  pie,
  size,
  showILS,
  compact,
}: {
  pie: PieDef;
  size: number;
  showILS: boolean;
  compact: boolean;
}) {
  const visible = pie.slices.filter(s => s.pct > 0);
  const total = visible.reduce((s, x) => s + x.pct, 0) || 1;
  const r = size / 2 - 4;
  const innerR = r * 0.6;
  const cx = size / 2;
  const cy = size / 2;

  // Build SVG arcs
  let cumAngle = 0;
  const arcs = visible.map((slice) => {
    const portion = slice.pct / total;
    const angle = portion * Math.PI * 2;
    const start = cumAngle;
    cumAngle += angle;
    return {
      slice,
      d: arcPath(cx, cy, r, innerR, start, cumAngle),
    };
  });

  // Dominant slice — featured in the center hole
  const dominant = visible.length > 0
    ? visible.reduce((a, b) => (a.pct > b.pct ? a : b))
    : null;

  return (
    <div className={`v-card ${compact ? "p-3" : "p-4"}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-verdant-muted mb-2 text-right">
        {pie.title}
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: size }}>
          <span className="text-[12px] text-verdant-muted">אין נתונים</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center mb-3">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {arcs.map((a, i) => (
                <path
                  key={i}
                  d={a.d}
                  fill={a.slice.color}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              ))}
              {/* Center text — dominant slice % */}
              {dominant && (
                <>
                  <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    className="font-extrabold tabular"
                    style={{ fontSize: compact ? 18 : 22, fill: "#012D1D" }}
                  >
                    {Math.round(dominant.pct)}%
                  </text>
                  <text
                    x={cx}
                    y={cy + (compact ? 12 : 16)}
                    textAnchor="middle"
                    style={{ fontSize: compact ? 10 : 11, fill: "rgba(1,45,29,0.6)" }}
                  >
                    {pie.centerLabel ?? dominant.label}
                  </text>
                </>
              )}
            </svg>
          </div>

          {/* Legend */}
          <div className="space-y-1">
            {visible.map(slice => (
              <div key={slice.key} className="flex items-center gap-2 text-[12px]">
                <span
                  className="inline-block rounded-sm shrink-0"
                  style={{ width: 10, height: 10, background: slice.color }}
                />
                <span className="text-verdant-ink font-bold flex-1 truncate">{slice.label}</span>
                <span className="tabular text-verdant-muted">{Math.round(slice.pct)}%</span>
                {showILS && typeof slice.ils === "number" && slice.ils > 0 && (
                  <span className="text-[11px] text-verdant-muted tabular">
                    {slice.ils.toLocaleString()}₪
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── SVG arc helper ─── */

/**
 * Build a donut-arc path from `start` to `end` angles (radians, 0=12 o'clock,
 * sweeping clockwise per CSS conventions).
 */
function arcPath(
  cx: number, cy: number, rOuter: number, rInner: number,
  start: number, end: number,
): string {
  const startO = polar(cx, cy, rOuter, start);
  const endO   = polar(cx, cy, rOuter, end);
  const startI = polar(cx, cy, rInner, end);
  const endI   = polar(cx, cy, rInner, start);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return [
    `M ${startO.x} ${startO.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endO.x} ${endO.y}`,
    `L ${startI.x} ${startI.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${endI.x} ${endI.y}`,
    "Z",
  ].join(" ");
}

function polar(cx: number, cy: number, r: number, angle: number) {
  // angle 0 = 12 o'clock, increasing clockwise
  const a = angle - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
