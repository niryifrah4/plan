"use client";

import { fmtILS } from "@/lib/format";

interface GrowthBar {
  year: number;
  value: number;
  type: "hist" | "now" | "fwd";
}

interface Props {
  currentNetWorth: number;
  growthRate?: number;
  histDecayRate?: number;
}

/**
 * Growth bar chart — SVG based, matching the original HTML.
 * 12 bars: 5 historical (back-decayed) + current + 6 forecast.
 */
export function GrowthChart({ currentNetWorth, growthRate = 0.06, histDecayRate = 0.08 }: Props) {
  const now = new Date().getFullYear();
  const bars: GrowthBar[] = [];

  for (let i = 5; i >= 1; i--)
    bars.push({
      year: now - i,
      value: currentNetWorth / Math.pow(1 + histDecayRate, i),
      type: "hist",
    });
  bars.push({ year: now, value: currentNetWorth, type: "now" });
  for (let i = 1; i <= 6; i++)
    bars.push({ year: now + i, value: currentNetWorth * Math.pow(1 + growthRate, i), type: "fwd" });

  const W = 600,
    H = 220;
  const maxV = Math.max(...bars.map((b) => Math.abs(b.value)), 10);
  const gap = 8;
  const bw = (W - gap * (bars.length - 1)) / bars.length;

  return (
    <div>
      <div className="relative" style={{ height: 220 }}>
        <svg
          className="h-full w-full overflow-visible"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
        >
          {/* gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = H * (1 - f);
            return <line key={f} x1="0" x2={W} y1={y} y2={y} stroke="#eef2e8" strokeWidth="1" />;
          })}
          {/* bars */}
          {bars.map((b, i) => {
            const x = i * (bw + gap);
            const h = Math.max(2, (Math.abs(b.value) / maxV) * (H - 10));
            const y = H - h;
            const fill = b.type === "hist" ? "#a7c5b5" : b.type === "now" ? "#012d1d" : "#2B694D";
            const opacity = b.type === "fwd" ? 0.55 : 1;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={bw}
                height={h}
                fill={fill}
                opacity={opacity}
                rx={3}
              />
            );
          })}
        </svg>
        {/* labels */}
        <div className="absolute bottom-[-22px] flex w-full justify-between px-0 text-[10px] font-semibold text-verdant-muted">
          {bars.map((b) => (
            <span
              key={b.year}
              className={b.type === "now" ? "font-bold text-verdant-ink" : ""}
              style={{ flex: 1, textAlign: "center" }}
            >
              {b.type === "now" ? "היום" : b.year}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
