"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  Pension Planner Drawer — side-by-side simulation
 * ═══════════════════════════════════════════════════════════
 *
 * Bottom drawer (75vh on desktop, full on mobile) that opens when the
 * advisor clicks "הרץ סימולציה" on a fund. Two columns — current vs
 * proposed — with sliders for fees / return / retirement age.
 *
 * The "story" footer translates the sliders' delta into plain Hebrew:
 *   "₪150 less per month → ₪380K more at retirement → ₪1,800/m more pension"
 *
 * No persistence yet (Phase 5 MVP). Future: save as PensionPlan entity.
 */

import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import type { PensionFund } from "@/lib/pension-store";
import {
  compareScenarios,
  fundGrossMonthlyContrib,
  fundEffectiveReturn,
  type PensionOptimization,
  type ScenarioOverrides,
} from "@/lib/pension-planner";

interface Props {
  fund: PensionFund;
  currentAge: number;
  retirementAge: number;
  /** If a specific optimization triggered this, seed the proposed sliders from it. */
  opt?: PensionOptimization;
  onClose: () => void;
}

export function PensionPlannerDrawer({ fund, currentAge, retirementAge, opt, onClose }: Props) {
  const baseFeeDeposit  = fund.mgmtFeeDeposit / 100;
  const baseFeeBalance  = fund.mgmtFeeBalance / 100;
  const baseReturn      = fundEffectiveReturn(fund) ?? 0.07;
  const baseGrossMonth  = fundGrossMonthlyContrib(fund);

  // Proposed defaults — start from optimization suggestion if present,
  // otherwise from a small reduction (the most common conversation).
  const [propFeeDeposit, setPropFeeDeposit] = useState(
    opt?.suggestedOverrides?.feeDeposit ?? Math.max(0, baseFeeDeposit - 0.003),
  );
  const [propFeeBalance, setPropFeeBalance] = useState(
    opt?.suggestedOverrides?.feeBalance ?? Math.max(0, baseFeeBalance - 0.002),
  );
  const [propReturn, setPropReturn] = useState(
    opt?.suggestedOverrides?.annualReturn ?? baseReturn,
  );
  const [propRetirementAge, setPropRetirementAge] = useState(retirementAge);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overrides: ScenarioOverrides = {
    feeDeposit: propFeeDeposit,
    feeBalance: propFeeBalance,
    annualReturn: propReturn,
  };

  // Effective retirement age affects YEARS — feed via inputs by recomputing scenarios.
  const baseCmp = compareScenarios(fund, currentAge, retirementAge, {});
  const propCmp = compareScenarios(fund, currentAge, propRetirementAge, overrides);
  const base = baseCmp.base;
  const proposed = propCmp.proposed;

  const balanceDelta = proposed.projectedBalance - base.projectedBalance;
  const monthlyPensionDelta = proposed.monthlyPension - base.monthlyPension;
  const lifetimeValue = monthlyPensionDelta * 12 * 20;

  return (
    <div className="fixed inset-0 z-50 flex items-end" dir="rtl">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(1,45,29,0.55)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-3xl mx-auto bg-white rounded-t-3xl shadow-2xl overflow-y-auto animate-slide-up"
        style={{
          maxHeight: "92vh",
          background: "#F9FAF2",
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between p-5 border-b v-divider" style={{ background: "#F9FAF2" }}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-verdant-muted">תכנון</div>
            <div className="text-base font-extrabold text-verdant-ink mt-0.5">
              סימולציה על {fund.company} · {fund.track || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(1,45,29,0.06)", color: "#012D1D" }}
            aria-label="סגור"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        <div className="p-5">
          {/* Result row — three numbers, the two states + the delta */}
          <section className="grid grid-cols-3 gap-3 mb-6">
            <ResultBlock label="היום" value={base.monthlyPension} tone="muted" />
            <ResultBlock label="אחרי" value={proposed.monthlyPension} tone="accent" />
            <ResultBlock
              label="הפרש לחודש"
              value={monthlyPensionDelta}
              tone={monthlyPensionDelta > 0 ? "positive" : monthlyPensionDelta < 0 ? "negative" : "muted"}
              showSign
            />
          </section>

          {/* Inputs — direct numeric typing, no sliders */}
          <section className="v-card p-4 mb-5">
            <SliderRow
              label="דמי ניהול מהפקדה"
              baseValue={baseFeeDeposit * 100}
              proposedValue={propFeeDeposit * 100}
              onChange={(v) => setPropFeeDeposit(v / 100)}
              min={0}
              max={6}
              step={0.05}
              suffix="%"
            />
            <SliderRow
              label="דמי ניהול מצבירה"
              baseValue={baseFeeBalance * 100}
              proposedValue={propFeeBalance * 100}
              onChange={(v) => setPropFeeBalance(v / 100)}
              min={0}
              max={1.5}
              step={0.01}
              suffix="%"
            />
            <SliderRow
              label="תשואה שנתית ברוטו"
              baseValue={baseReturn * 100}
              proposedValue={propReturn * 100}
              onChange={(v) => setPropReturn(v / 100)}
              min={2}
              max={12}
              step={0.1}
              suffix="%"
            />
            <SliderRow
              label="גיל פרישה"
              baseValue={retirementAge}
              proposedValue={propRetirementAge}
              onChange={(v) => setPropRetirementAge(Math.round(v))}
              min={60}
              max={75}
              step={1}
              suffix=""
            />
          </section>

          {/* Story footer */}
          <section
            className="rounded-2xl p-5 mb-4"
            style={{
              background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
              color: "#F9FAF2",
            }}
          >
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
              הסיפור
            </div>
            <Story
              monthlyPensionDelta={monthlyPensionDelta}
              balanceDelta={balanceDelta}
              lifetimeValue={lifetimeValue}
            />
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[13px] font-bold"
              style={{ background: "rgba(1,45,29,0.06)", color: "#012D1D" }}
            >
              סגור
            </button>
            <button
              disabled
              title="בקרוב — שמירת תכנית למעקב והפצה ללקוח"
              className="px-4 py-2 rounded-xl text-[13px] font-bold opacity-60 cursor-not-allowed"
              style={{ background: "#1B4332", color: "#FFFFFF" }}
            >
              <span className="material-symbols-outlined text-[16px] align-middle ml-1">bookmark_add</span>
              שמור כתכנית (בקרוב)
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-slide-up { animation: slideUp 220ms ease-out; }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────── */

function ResultBlock({
  label,
  value,
  tone,
  showSign = false,
}: {
  label: string;
  value: number;
  tone: "muted" | "accent" | "positive" | "negative";
  showSign?: boolean;
}) {
  const palette: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    muted:    { bg: "rgba(1,45,29,0.03)",   fg: "#012D1D", border: "rgba(1,45,29,0.06)" },
    accent:   { bg: "#FFFFFF",              fg: "#012D1D", border: "rgba(27,67,50,0.20)" },
    positive: { bg: "rgba(27,67,50,0.06)",  fg: "#1B4332", border: "rgba(27,67,50,0.30)" },
    negative: { bg: "rgba(139,46,46,0.06)", fg: "#8B2E2E", border: "rgba(139,46,46,0.30)" },
  };
  const c = palette[tone];
  const sign = showSign && value > 0 ? "+" : "";
  return (
    <div
      className="p-4 rounded-2xl text-center"
      style={{ background: c.bg, border: `1.5px solid ${c.border}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">{label}</div>
      <div className="text-2xl font-extrabold tabular mt-1.5" style={{ color: c.fg }}>
        {sign}{fmtILS(Math.round(value))}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  baseValue,
  proposedValue,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  baseValue: number;
  proposedValue: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b" style={{ borderColor: "rgba(1,45,29,0.06)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-verdant-ink">{label}</div>
        <div className="text-[11px] text-verdant-muted mt-0.5">היום: {baseValue.toFixed(2)}{suffix}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={proposedValue}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="w-24 px-3 py-1.5 rounded-lg text-[14px] font-extrabold tabular text-center"
          style={{
            background: "#FFFFFF",
            border: "1.5px solid rgba(27,67,50,0.20)",
            color: "#012D1D",
            outline: "none",
          }}
          inputMode="decimal"
        />
        <span className="text-[12px] font-bold text-verdant-muted">{suffix}</span>
      </div>
    </div>
  );
}

function Story({
  monthlyPensionDelta,
  balanceDelta,
  lifetimeValue,
}: {
  monthlyPensionDelta: number;
  balanceDelta: number;
  lifetimeValue: number;
}) {
  // No change yet — reset state
  if (Math.abs(monthlyPensionDelta) < 1) {
    return (
      <div className="text-[13px] leading-7" style={{ color: "rgba(255,255,255,0.85)" }}>
        זוז על ה-sliders כדי לראות את ההשפעה של שינוי דמי ניהול, מסלול, או גיל פרישה.
      </div>
    );
  }

  const positive = monthlyPensionDelta > 0;
  return (
    <div className="text-[14px] leading-8" style={{ color: "#F9FAF2" }}>
      {positive ? (
        <>
          השינוי הזה מוסיף{" "}
          <strong className="text-[18px] tabular" style={{ color: "#C1ECD4" }}>
            {fmtILS(Math.round(balanceDelta))}
          </strong>{" "}
          לצבירה בפרישה.
          <br />
          <strong className="text-[18px] tabular" style={{ color: "#C1ECD4" }}>
            +{fmtILS(Math.round(monthlyPensionDelta))}
          </strong>{" "}
          לחודש לקצבה — לכל החיים.
          <br />
          לאורך 20 שנות פרישה: שווי כלכלי של{" "}
          <strong className="text-[18px] tabular" style={{ color: "#C1ECD4" }}>
            {fmtILS(Math.round(lifetimeValue))}
          </strong>
          .
        </>
      ) : (
        <>
          השינוי הזה <strong>מקטין</strong> את הקצבה ב-
          <strong className="text-[18px] tabular" style={{ color: "#FCA5A5" }}>
            {fmtILS(Math.abs(Math.round(monthlyPensionDelta)))}
          </strong>{" "}
          לחודש בפרישה.
          <br />
          לאורך 20 שנות פרישה זה{" "}
          <strong className="text-[18px] tabular" style={{ color: "#FCA5A5" }}>
            {fmtILS(Math.abs(Math.round(lifetimeValue)))}
          </strong>{" "}
          פחות.
        </>
      )}
    </div>
  );
}
