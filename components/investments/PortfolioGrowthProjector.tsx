"use client";

/**
 * PortfolioGrowthProjector — "what will my portfolio be worth in X years?"
 * Built 2026-05-02 per Nir's "what WILL be" theme.
 *
 * Inputs (sliders):
 *   - years to project (1-30)
 *   - expected annual return (0-15%)
 *   - additional monthly contribution
 *
 * Output: projected balance with year-by-year mini-chart + capital gains tax
 * preview (25% on the gain) for the realized number.
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";

interface Props {
  /** Current portfolio market value in ₪ (post-tax basis is irrelevant here). */
  currentValue: number;
}

export function PortfolioGrowthProjector({ currentValue }: Props) {
  const [years, setYears] = useState(10);
  const [returnPct, setReturnPct] = useState(7);
  const [monthlyContrib, setMonthlyContrib] = useState(2000);

  const projection = useMemo(() => {
    const r = returnPct / 100;
    const monthlyR = Math.pow(1 + r, 1 / 12) - 1;
    const points: { year: number; balance: number; contributed: number }[] = [];
    let bal = currentValue;
    let totalContrib = 0;
    for (let m = 1; m <= years * 12; m++) {
      bal = bal * (1 + monthlyR) + monthlyContrib;
      totalContrib += monthlyContrib;
      if (m % 12 === 0) {
        points.push({
          year: m / 12,
          balance: Math.round(bal),
          contributed: totalContrib,
        });
      }
    }
    const gain = bal - currentValue - totalContrib;
    const tax = Math.round(Math.max(0, gain) * 0.25);
    return {
      points,
      finalBalance: Math.round(bal),
      totalContrib,
      gain: Math.round(gain),
      tax,
      netAfterTax: Math.round(bal - tax),
    };
  }, [currentValue, years, returnPct, monthlyContrib]);

  const max = Math.max(...projection.points.map((p) => p.balance), 1);

  return (
    <section className="card-pad mb-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            צמיחת תיק עתידית
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">
            כמה יהיה לך בעוד {years} שנים
          </h3>
        </div>
      </div>

      {/* Inputs */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SliderField
          label="שנים קדימה"
          value={years}
          min={1}
          max={30}
          step={1}
          unit={years === 1 ? "שנה" : "שנים"}
          onChange={setYears}
        />
        <SliderField
          label="תשואה שנתית"
          value={returnPct}
          min={0}
          max={12}
          step={0.5}
          unit="%"
          onChange={setReturnPct}
        />
        <SliderField
          label="הפקדה חודשית"
          value={monthlyContrib}
          min={0}
          max={20000}
          step={500}
          unit="₪"
          onChange={setMonthlyContrib}
          fmt={fmtILS}
        />
      </div>

      {/* Big number */}
      <div
        className="mb-4 rounded-2xl py-4 text-center"
        style={{
          background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
          color: "#F9FAF2",
        }}
      >
        <div
          className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          שווי התיק בעוד {years} שנים
        </div>
        <div
          className="mt-2 text-[40px] font-extrabold tabular-nums leading-none"
          style={{ fontFamily: "Manrope, Assistant, sans-serif" }}
        >
          {fmtILS(projection.finalBalance)}
        </div>
        <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
          אחרי מס רווחי הון 25% → <strong>{fmtILS(projection.netAfterTax)}</strong>
        </div>
      </div>

      {/* Year-by-year chart */}
      <div
        className="mb-3 grid items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${projection.points.length}, 1fr)`, minHeight: 120 }}
      >
        {projection.points.map((p) => {
          const heightPct = (p.balance / max) * 100;
          return (
            <div
              key={p.year}
              className="flex flex-col items-center justify-end"
              style={{ height: 100 }}
              title={`שנה ${p.year}: ${fmtILS(p.balance)}`}
            >
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(heightPct, 2)}%`,
                  background: "#1B4332",
                  opacity: 0.7 + (p.year / years) * 0.3,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        className="mb-4 grid gap-1 text-center text-[9px] text-verdant-muted"
        style={{ gridTemplateColumns: `repeat(${projection.points.length}, 1fr)` }}
      >
        {projection.points.map((p) => (
          <div key={`l${p.year}`}>{p.year}</div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 gap-3 text-[12px] md:grid-cols-3">
        <Stat label="הון נוכחי" value={currentValue} />
        <Stat label={`סך הפקדות (${years}y)`} value={projection.totalContrib} />
        <Stat label="רווח צבור (לפני מס)" value={projection.gain} positive />
      </div>

      <div className="mt-3 text-[11px] text-verdant-muted">
        תחזית מבוססת על תשואה ממוצעת. בפועל יש תנודתיות; לטווח 10+ שנים הסטייה מתעמעמת.
      </div>
    </section>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  fmt?: (n: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[12px] font-bold text-verdant-ink">{label}</label>
        <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">
          {fmt ? fmt(value) : `${value}${unit ? " " + unit : ""}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full accent-[#1B4332]"
      />
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-3" style={{ border: "1px solid #eef2e8" }}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        {label}
      </div>
      <div
        className="text-base font-extrabold tabular-nums"
        style={{ color: positive && value > 0 ? "#1B4332" : "#012D1D" }}
      >
        {positive && value > 0 ? "+" : ""}
        {fmtILS(value)}
      </div>
    </div>
  );
}
