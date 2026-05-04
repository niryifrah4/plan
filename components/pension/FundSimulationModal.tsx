"use client";

/**
 * Per-fund simulation modal — opens from the row-level "סימולציה" button
 * on /pension. Lets the user play with rate, fees, contribution, and
 * years-to-retirement on ONE fund without affecting the global trajectory.
 *
 * Built 2026-04-28 per Nir: he had this feature once and lost it in a
 * refactor; the global retirement page does only portfolio-level math.
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { simulateFund, defaultFactorByType, type SimInputs } from "@/lib/pension-fund-sim";
import type { PensionFund } from "@/lib/pension-store";
import { loadAssumptions } from "@/lib/assumptions";

interface Props {
  fund: PensionFund;
  onClose: () => void;
}

export function FundSimulationModal({ fund, onClose }: Props) {
  const a = loadAssumptions();
  const yearsToRetire = Math.max(1, (a.retirementAge || 67) - (a.currentAge || 35));

  // Baseline = current state of this fund (no overrides). Sim sliders compare
  // against this.
  const baseline: SimInputs = useMemo(
    () => ({
      expectedReturnPct: 6, // sensible default
      mgmtFeeBalancePct: fund.mgmtFeeBalance || 0.5,
      monthlyContrib: fund.monthlyContrib || 0,
      yearsToRetirement: yearsToRetire,
      conversionFactor: fund.conversionFactor || defaultFactorByType(fund.type),
    }),
    [fund, yearsToRetire]
  );

  const [inputs, setInputs] = useState<SimInputs>(baseline);

  const result = useMemo(() => simulateFund(fund, inputs, baseline), [fund, inputs, baseline]);

  const set = <K extends keyof SimInputs>(key: K, v: SimInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: v }));

  const reset = () => setInputs(baseline);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="v-divider sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              סימולציה
            </div>
            <h2 className="text-lg font-extrabold text-verdant-ink">{fund.company}</h2>
            <div className="mt-0.5 text-[11px] text-verdant-muted">
              {fund.track || "מסלול לא מצוין"}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-verdant-bg">
            <span className="material-symbols-outlined text-[20px] text-verdant-muted">close</span>
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-4 px-6 py-5">
          <SliderRow
            label="תשואה צפויה (שנתית)"
            unit="%"
            value={inputs.expectedReturnPct}
            min={0}
            max={12}
            step={0.25}
            onChange={(v) => set("expectedReturnPct", v)}
          />
          <SliderRow
            label="דמי ניהול מצבירה"
            unit="%"
            value={inputs.mgmtFeeBalancePct}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => set("mgmtFeeBalancePct", v)}
          />
          <SliderRow
            label="הפקדה חודשית"
            unit="₪"
            value={inputs.monthlyContrib}
            min={0}
            max={10000}
            step={100}
            onChange={(v) => set("monthlyContrib", v)}
            valueFormatter={fmtILS}
          />
          <SliderRow
            label="שנים לפרישה"
            unit="שנים"
            value={inputs.yearsToRetirement}
            min={1}
            max={50}
            step={1}
            onChange={(v) => set("yearsToRetirement", v)}
          />
        </div>

        {/* Results */}
        <div className="v-divider border-t px-6 py-4" style={{ background: "#F9FAF2" }}>
          <div className="grid grid-cols-2 gap-4">
            <ResultCard
              label="צבירה צפויה בפרישה"
              value={fmtILS(result.finalBalance)}
              delta={result.balanceDelta}
              deltaPct={result.balanceDeltaPct}
            />
            <ResultCard
              label="קצבה חודשית מהקופה"
              value={fmtILS(result.monthlyPension)}
              sub={`מקדם ${inputs.conversionFactor}`}
              delta={result.pensionDelta}
              deltaPct={result.pensionDeltaPct}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="v-divider flex items-center justify-between border-t px-6 py-3">
          <button
            onClick={reset}
            className="text-[12px] font-bold text-verdant-emerald hover:underline"
          >
            ↺ אפס לערכים נוכחיים
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-bold"
            style={{ background: "#1B4332", color: "#fff" }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  valueFormatter,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueFormatter?: (n: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[12px] font-bold text-verdant-ink">{label}</label>
        <div className="text-[13px] font-extrabold tabular-nums text-verdant-ink">
          {valueFormatter ? valueFormatter(value) : `${value} ${unit}`}
        </div>
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

function ResultCard({
  label,
  value,
  sub,
  delta,
  deltaPct,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: number;
  deltaPct: number;
}) {
  const positive = delta > 0;
  const negative = delta < 0;
  const color = positive ? "#1B4332" : negative ? "#8B2E2E" : "#5a7a6a";
  const sign = positive ? "+" : "";
  return (
    <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #eef2e8" }}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        {label}
      </div>
      <div
        className="text-2xl font-extrabold tabular-nums text-verdant-ink"
        style={{ fontFamily: "Manrope, Assistant, system-ui, sans-serif" }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-verdant-muted">{sub}</div>}
      <div className="mt-1.5 text-[12px] font-bold tabular-nums" style={{ color }}>
        {Math.abs(delta) < 1
          ? "ללא שינוי"
          : `${sign}${Math.round(delta).toLocaleString()} ₪ (${sign}${deltaPct.toFixed(1)}%)`}
      </div>
    </div>
  );
}
