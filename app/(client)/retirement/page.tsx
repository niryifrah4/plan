"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  /retirement — The Retirement Workshop
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The "heart of the heart" for Nir: a dedicated page where every lever of
 * the retirement plan is tweakable live. Pull a slider → the engine
 * (computeMonthlyIncomeTrajectory) re-runs → chart, gap, timeline all reflow.
 *
 * Layout:
 *   1. KPI strip            target / projected-at-retirement / gap / coverage
 *   2. Interactive sliders  retirementAge, monthlyInvestment, SWR
 *   3. Income mountain      stacked areas of all income layers + target line
 *   4. Event timeline       hishtalmut-start / BTL-start / mortgage-end
 *   5. Advisor panel        (Stage 4c) Claude streams structured insights
 */

import { useState, useEffect, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { SolidKpi } from "@/components/ui/SolidKpi";
import { useClient } from "@/lib/client-context";
import { loadAssumptions, type Assumptions } from "@/lib/assumptions";
import { loadProperties } from "@/lib/realestate-store";
import { loadPensionFunds } from "@/lib/pension-store";
import { loadAccounts, totalBankBalance } from "@/lib/accounts-store";
import { loadSecurities, totalSecuritiesValue } from "@/lib/securities-store";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import { buildTrajectory } from "@/lib/trajectory-builder";
import {
  computeMonthlyIncomeTrajectory,
  loadTargetRetirementIncome,
  weightedConversionFactor,
} from "@/lib/retirement-income";
import { RetirementAdvisorPanel } from "./RetirementAdvisorPanel";
import { AnnualReviewPanel } from "@/components/AnnualReviewPanel";

export default function RetirementPage() {
  const { familyName, clientId } = useClient();
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [reProperties, setReProperties] = useState<ReturnType<typeof loadProperties>>([]);
  const [pensionFunds, setPensionFunds] = useState<ReturnType<typeof loadPensionFunds>>([]);
  const [liquid, setLiquid] = useState(0);
  const [targetMonthly, setTargetMonthly] = useState(0);

  // ── Slider overrides — start from assumptions, user tweaks, engine responds
  const [ovrRetirementAge, setOvrRetirementAge] = useState<number | null>(null);
  const [ovrMonthlyInvest, setOvrMonthlyInvest] = useState<number | null>(null);
  const [ovrSWR, setOvrSWR] = useState<number | null>(null);
  // 2026-04-29 scenario planning per Nir.
  // expense shock: extra ₪/month (e.g. another child) reduces what's left
  //   to invest. We model it by lowering monthlyInvestment for the chosen
  //   number of years. 0 = scenario off.
  const [ovrExtraExpense, setOvrExtraExpense]   = useState(0);
  const [ovrExtraExpenseYears, setOvrExtraExpenseYears] = useState(18);
  // portfolio shock: one-time haircut on the liquid balance (-10/-20/-30%).
  const [ovrPortfolioShock, setOvrPortfolioShock] = useState(0);
  // income gap: years with zero monthly investment (sabbatical / job loss).
  const [ovrIncomeGapYears, setOvrIncomeGapYears] = useState(0);

  useEffect(() => {
    syncOnboardingToStores();
    const reload = () => {
      setAssumptions(loadAssumptions());
      setReProperties(loadProperties());
      setPensionFunds(loadPensionFunds());
      const accts = loadAccounts();
      setLiquid(totalBankBalance(accts) + totalSecuritiesValue(loadSecurities()));
      setTargetMonthly(loadTargetRetirementIncome());
    };
    reload();
    const handler = () => reload();
    window.addEventListener("verdant:realestate:updated", handler);
    window.addEventListener("verdant:pension:updated", handler);
    return () => {
      window.removeEventListener("verdant:realestate:updated", handler);
      window.removeEventListener("verdant:pension:updated", handler);
    };
  }, [clientId]);

  /* ─── Advisor "Apply" button handler — moves sliders from insights cards ─── */
  useEffect(() => {
    const onApply = (e: Event) => {
      const action = (e as CustomEvent).detail as {
        kind: string; targetValue?: number;
      };
      if (!action?.kind) return;
      switch (action.kind) {
        case "retirement_age":
          if (action.targetValue != null) setOvrRetirementAge(action.targetValue);
          break;
        case "monthly_invest":
          if (action.targetValue != null) setOvrMonthlyInvest(action.targetValue);
          break;
        case "swr":
          if (action.targetValue != null) setOvrSWR(action.targetValue / 100);
          break;
        case "add_property":
          window.location.href = "/realestate";
          break;
      }
    };
    window.addEventListener("retirement:advisor:apply", onApply);
    return () => window.removeEventListener("retirement:advisor:apply", onApply);
  }, []);

  /* ─── Effective assumptions (slider-overridden) ─── */
  const effAssumptions = useMemo<Assumptions | null>(() => {
    if (!assumptions) return null;
    // Combined effect of sliders + scenarios. Income-gap zeroes monthlyInvestment
    // for the duration; expense-shock subtracts a flat ₪/mo from it for years.
    const baseInvest = ovrMonthlyInvest ?? assumptions.monthlyInvestment;
    const investAfterScenarios = ovrIncomeGapYears > 0
      ? 0  // crude: income gap = no contribution at all during the period
      : Math.max(0, baseInvest - (ovrExtraExpense || 0));
    return {
      ...assumptions,
      retirementAge: ovrRetirementAge ?? assumptions.retirementAge,
      monthlyInvestment: investAfterScenarios,
      safeWithdrawalRate: ovrSWR ?? assumptions.safeWithdrawalRate ?? 0.04,
    };
  }, [assumptions, ovrRetirementAge, ovrMonthlyInvest, ovrSWR, ovrExtraExpense, ovrIncomeGapYears]);

  /* ─── Live trajectory + income ─── */
  const trajectory = useMemo(() => {
    if (!effAssumptions) return [];
    const pensionBalance = pensionFunds.reduce((s, f) => s + (f.balance || 0), 0);
    const realEstateVal = reProperties.reduce((s, p) => s + p.currentValue, 0);
    // Apply portfolio-shock to the starting liquid balance.
    const shockedLiquid = ovrPortfolioShock > 0
      ? liquid * (1 - ovrPortfolioShock / 100)
      : liquid;
    return buildTrajectory({
      assumptions: effAssumptions,
      liquid: shockedLiquid,
      pension: pensionBalance,
      realestate: realEstateVal,
    });
  }, [effAssumptions, pensionFunds, reProperties, liquid, ovrPortfolioShock]);

  const incomeResult = useMemo(() => {
    if (!effAssumptions) return null;
    return computeMonthlyIncomeTrajectory(trajectory, effAssumptions, {
      properties: reProperties,
      pensionFunds,
      btlAge: 67,
      targetMonthly,
    });
  }, [trajectory, effAssumptions, reProperties, pensionFunds, targetMonthly]);

  /* ─── UI helpers ─── */
  const retAge = effAssumptions?.retirementAge ?? 67;
  const retPoint = incomeResult?.points.find(p => p.age === retAge);
  const coverage = targetMonthly > 0 && retPoint ? Math.min(100, (retPoint.total / targetMonthly) * 100) : 0;
  const gap = incomeResult?.gapAtRetirement ?? 0;

  if (!assumptions || !effAssumptions || !incomeResult) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-pulse text-verdant-muted">טוען...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto" style={{ fontFamily: "'Assistant', sans-serif" }}>
      {/* Page header removed 2026-04-28 per Nir's request. */}

      {/* ═══ KPI strip ═══ unified to SolidKpi 2026-04-29 (was local Kpi). */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <SolidKpi label="יעד חודשי"               value={fmtILS(targetMonthly)}            icon="flag"           tone="ink"     sub="מהשאלון" />
        <SolidKpi label={`צפוי בגיל ${retAge}`}    value={fmtILS(Math.round(retPoint?.total ?? 0))} icon="trending_up" tone="forest" />
        <SolidKpi
          label={gap > 0 ? "פער" : "עודף"}
          value={fmtILS(Math.abs(Math.round(gap)))}
          icon={gap > 0 ? "trending_down" : "verified"}
          tone={gap > 0 ? "red" : "emerald"}
        />
        <SolidKpi label="כיסוי" value={`${Math.round(coverage)}%`} icon="shield"
                  tone={coverage >= 100 ? "emerald" : coverage >= 80 ? "amber" : "red"} />
      </section>

      {/* ═══ Sliders ═══ */}
      <section className="card-pad-lg mb-8">
        <h3 className="t-lg font-extrabold mb-5" style={{ color: "var(--botanical-forest)" }}>
          מחוונים · משוך ותראה את ההשפעה
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <SliderField
            label="גיל פרישה"
            value={effAssumptions.retirementAge}
            min={55} max={75} step={1}
            onChange={v => setOvrRetirementAge(v)}
            originalValue={assumptions.retirementAge}
            onReset={() => setOvrRetirementAge(null)}
            suffix=" שנים"
          />
          <SliderField
            label="הפקדה חודשית לחיסכון"
            value={effAssumptions.monthlyInvestment}
            min={0} max={20000} step={500}
            onChange={v => setOvrMonthlyInvest(v)}
            originalValue={assumptions.monthlyInvestment}
            onReset={() => setOvrMonthlyInvest(null)}
            formatter={v => fmtILS(v)}
          />
          <SliderField
            label="שיעור משיכה בטוח (SWR)"
            value={(effAssumptions.safeWithdrawalRate ?? 0.04) * 100}
            min={2.5} max={5} step={0.1}
            onChange={v => setOvrSWR(v / 100)}
            originalValue={(assumptions.safeWithdrawalRate ?? 0.04) * 100}
            onReset={() => setOvrSWR(null)}
            suffix="%"
          />
        </div>
      </section>

      {/* ═══ Scenario Planning — what-if 2026-04-29 ═══ */}
      <section className="card-pad-lg mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="t-lg font-extrabold" style={{ color: "var(--botanical-forest)" }}>
            תרחישים · "מה אם"
          </h3>
          {(ovrExtraExpense > 0 || ovrPortfolioShock > 0 || ovrIncomeGapYears > 0) && (
            <button
              onClick={() => { setOvrExtraExpense(0); setOvrPortfolioShock(0); setOvrIncomeGapYears(0); }}
              className="text-[12px] font-bold text-verdant-emerald hover:underline"
            >
              ↺ אפס תרחישים
            </button>
          )}
        </div>
        <div className="space-y-4">
          {/* Extra expense — e.g. another child */}
          <div>
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <label className="font-bold text-verdant-ink">הוצאה חודשית נוספת (עוד ילד / מקרה חיים)</label>
              <span className="font-extrabold tabular-nums" style={{ color: ovrExtraExpense > 0 ? "#B45309" : "#5a7a6a" }}>
                {ovrExtraExpense > 0 ? `−${fmtILS(ovrExtraExpense)}/חודש` : "ללא"}
              </span>
            </div>
            <input
              type="range" min={0} max={8000} step={500}
              value={ovrExtraExpense}
              onChange={(e) => setOvrExtraExpense(parseInt(e.target.value) || 0)}
              className="w-full h-1.5 accent-[#B45309]"
            />
          </div>

          {/* Portfolio shock — sudden market drop */}
          <div>
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <label className="font-bold text-verdant-ink">ירידה חד-פעמית בתיק (מימוש סיכון)</label>
              <span className="font-extrabold tabular-nums" style={{ color: ovrPortfolioShock > 0 ? "#8B2E2E" : "#5a7a6a" }}>
                {ovrPortfolioShock > 0 ? `−${ovrPortfolioShock}%` : "ללא"}
              </span>
            </div>
            <div className="inline-flex rounded-lg p-0.5" style={{ background: "#eef2e8" }}>
              {[0, 10, 20, 30].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setOvrPortfolioShock(pct)}
                  className="text-[11px] font-bold px-3 py-1 rounded-md transition-all"
                  style={{
                    background: ovrPortfolioShock === pct ? "#8B2E2E" : "transparent",
                    color: ovrPortfolioShock === pct ? "#fff" : "#1B4332",
                  }}
                >
                  {pct === 0 ? "ללא" : `−${pct}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Income gap — sabbatical / job loss */}
          <div>
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <label className="font-bold text-verdant-ink">שנות הפסקת הכנסה (שבתון / חופשה)</label>
              <span className="font-extrabold tabular-nums" style={{ color: ovrIncomeGapYears > 0 ? "#B45309" : "#5a7a6a" }}>
                {ovrIncomeGapYears > 0 ? `${ovrIncomeGapYears} שנים` : "ללא"}
              </span>
            </div>
            <input
              type="range" min={0} max={5} step={1}
              value={ovrIncomeGapYears}
              onChange={(e) => setOvrIncomeGapYears(parseInt(e.target.value) || 0)}
              className="w-full h-1.5 accent-[#B45309]"
            />
            <div className="flex justify-between text-[9px] text-verdant-muted mt-0.5 px-0.5">
              <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Income Mountain ═══ */}
      <section className="card-pad-lg mb-8">
        <IncomeMountain
          points={incomeResult.points}
          retirementAge={retAge}
          targetMonthly={targetMonthly}
        />
      </section>

      {/* ═══ Event Timeline ═══ */}
      {incomeResult.events.length > 0 && (
        <section className="card-pad-lg mb-8">
          <h3 className="t-lg font-extrabold mb-5" style={{ color: "var(--botanical-forest)" }}>
            ציר זמן · אירועים מרכזיים
          </h3>
          <EventTimeline events={incomeResult.events} />
        </section>
      )}

      {/* ═══ Advisor Panel (Stage 4c) ═══ */}
      <RetirementAdvisorPanel
        incomeResult={incomeResult}
        assumptions={effAssumptions}
        targetMonthly={targetMonthly}
        familyName={familyName}
      />

      {/* ═══ Annual Review — strategic brain (2026-04-29) ═══ */}
      <AnnualReviewPanel />
    </div>
  );
}

/* ═══════════════ Sub-components ═══════════════ */

function Kpi({ label, value, hint, color, suffix, isPct, highlight }: {
  label: string; value: number; hint?: string; color: string;
  suffix?: string; isPct?: boolean; highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: highlight ? `${color}12` : "#f9faf2",
        border: `1px solid ${highlight ? color + "40" : "#d8e0d0"}`,
      }}
    >
      <div className="text-[10px] font-bold" style={{ color: highlight ? color : "#8aab99" }}>{label}</div>
      <div className="text-2xl font-extrabold tabular mt-1" style={{ color }}>
        {isPct ? `${Math.round(value)}${suffix ?? ""}` : fmtILS(Math.round(value))}
      </div>
      {hint && <div className="text-[10px] text-verdant-muted font-bold mt-1">{hint}</div>}
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange, originalValue, onReset, suffix, formatter }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; originalValue: number; onReset: () => void;
  suffix?: string; formatter?: (v: number) => string;
}) {
  const modified = Math.abs(value - originalValue) > 0.0001;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-bold text-verdant-ink">{label}</span>
        {modified && (
          <button
            onClick={onReset}
            className="text-[10px] font-bold text-verdant-muted hover:text-verdant-ink underline"
          >
            איפוס
          </button>
        )}
      </div>
      <div className="text-xl font-extrabold tabular mb-2" style={{ color: modified ? "#B45309" : "#1B4332" }}>
        {formatter ? formatter(value) : `${value.toFixed(step < 1 ? 1 : 0)}${suffix ?? ""}`}
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-botanical-forest"
        style={{ accentColor: "#1B4332" }}
      />
      <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-1">
        <span>{min}{suffix ?? ""}</span>
        <span>{max}{suffix ?? ""}</span>
      </div>
    </div>
  );
}

function IncomeMountain({ points, retirementAge, targetMonthly }: {
  points: ReturnType<typeof computeMonthlyIncomeTrajectory>["points"];
  retirementAge: number; targetMonthly: number;
}) {
  const CW = 820, CH = 280, PAD_TOP = 30;
  const maxY = Math.max(...points.map(p => p.total), targetMonthly * 1.15, 1);
  const chartW = CW - 60;
  // Guard: points.length < 2 would divide by 0/−1 and NaN the entire SVG
  const xOf = (i: number) => points.length > 1 ? (i / (points.length - 1)) * chartW : 0;
  const yOf = (v: number) => PAD_TOP + (CH - PAD_TOP) * (1 - v / maxY);

  // Early out when there's no meaningful trajectory
  if (points.length === 0) {
    return <div className="text-center py-10 text-verdant-muted text-sm font-bold">אין נתונים</div>;
  }
  const fmtY = (v: number) => v >= 1000 ? `₪${Math.round(v / 100) / 10}K` : `₪${Math.round(v)}`;

  // Stacked layers from bottom to top
  const bandPath = (getY: (p: typeof points[number]) => number) =>
    `M 0 ${CH} ` +
    points.map((p, i) => `L ${xOf(i)} ${yOf(getY(p))}`).join(" ") +
    ` L ${chartW} ${CH} Z`;

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="caption mb-1">Income Mountain · הר ההכנסה</div>
          <h3 className="t-lg font-extrabold" style={{ color: "var(--botanical-forest)" }}>הכנסה חודשית לאורך הפרישה</h3>
        </div>
        <div className="flex gap-3 text-[10px] font-bold text-verdant-muted">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#2B694D" }} />שכ&quot;ד</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#1e6b3a" }} />פנסיה</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#4a7a3a" }} />בט&quot;ל</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#7a9a4a" }} />השתלמות</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#1B4332" }} />נזיל (SWR)</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ height: 320, background: "#fafcf8", borderRadius: 8 }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = PAD_TOP + (CH - PAD_TOP) * (1 - f);
          return (
            <g key={f}>
              <line x1="0" x2={chartW} y1={y} y2={y} stroke="#eef2e8" strokeDasharray={f === 0 ? undefined : "2 4"} />
              {f > 0 && (
                <text x={CW - 2} y={y + 4} textAnchor="end" fontSize="9" fill="#8aab99" fontWeight="600">
                  {fmtY(maxY * f)}
                </text>
              )}
            </g>
          );
        })}

        {/* Stacked bands — bottom to top: RE → pension → btl → hishtalmut → SWR+manual */}
        <path d={bandPath(p => p.realestateNet + p.pension + p.btl + p.hishtalmut + p.liquidSWR + p.manual)} fill="#1B4332" opacity="0.55" />
        <path d={bandPath(p => p.realestateNet + p.pension + p.btl + p.hishtalmut)} fill="#7a9a4a" opacity="0.65" />
        <path d={bandPath(p => p.realestateNet + p.pension + p.btl)} fill="#4a7a3a" opacity="0.7" />
        <path d={bandPath(p => p.realestateNet + p.pension)} fill="#1e6b3a" opacity="0.75" />
        <path d={bandPath(p => p.realestateNet)} fill="#2B694D" opacity="0.8" />

        {/* Total line */}
        <polyline
          points={points.map((p, i) => `${xOf(i)},${yOf(p.total)}`).join(" ")}
          fill="none" stroke="#012d1d" strokeWidth="2.25" strokeLinecap="round"
        />

        {/* Target line */}
        {targetMonthly > 0 && (
          <g>
            <line x1="0" x2={chartW} y1={yOf(targetMonthly)} y2={yOf(targetMonthly)}
              stroke="#b91c1c" strokeDasharray="6 4" strokeWidth="1.5" opacity="0.75" />
            <rect x={4} y={yOf(targetMonthly) - 16} width="110" height="14" rx="4" fill="#b91c1c" opacity="0.12" />
            <text x={8} y={yOf(targetMonthly) - 5} fontSize="9" fill="#8B2E2E" fontWeight="800">
              יעד · {fmtY(targetMonthly)}/חודש
            </text>
          </g>
        )}

        {/* Retirement age marker */}
        {(() => {
          const idx = points.findIndex(p => p.age === retirementAge);
          if (idx < 0) return null;
          const x = xOf(idx);
          return (
            <g>
              <line x1={x} x2={x} y1={PAD_TOP} y2={CH} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth="1.5" opacity="0.65" />
              <rect x={x - 24} y={4} width="48" height="14" rx="4" fill="#f59e0b" opacity="0.15" />
              <text x={x} y={14} textAnchor="middle" fontSize="9" fill="#b45309" fontWeight="800">פרישה</text>
            </g>
          );
        })()}
      </svg>
      <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-2 px-1">
        {points.length > 0 && (
          <>
            <span>גיל {points[0].age} ({points[0].year})</span>
            <span>גיל {points[points.length - 1].age} ({points[points.length - 1].year})</span>
          </>
        )}
      </div>
    </div>
  );
}

function EventTimeline({ events }: { events: ReturnType<typeof computeMonthlyIncomeTrajectory>["events"] }) {
  const sorted = [...events].sort((a, b) => a.age - b.age);
  const KIND_ICON: Record<string, string> = {
    retirement: "elderly", btl_start: "account_balance",
    hishtalmut: "school", mortgage_payoff: "home",
  };
  const KIND_COLOR: Record<string, string> = {
    retirement: "#f59e0b", btl_start: "#1B4332",
    hishtalmut: "#7a9a4a", mortgage_payoff: "#2B694D",
  };
  return (
    <div className="relative pr-6">
      <div className="absolute right-[10px] top-2 bottom-2 w-px" style={{ background: "#d8e0d0" }} />
      {sorted.map((ev, i) => (
        <div key={i} className="flex items-start gap-4 mb-4 relative">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 relative z-10 mt-0.5"
            style={{ background: KIND_COLOR[ev.kind], border: "2px solid #fafcf8" }}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: 11 }}>
              {KIND_ICON[ev.kind]}
            </span>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold text-verdant-ink">{ev.label}</div>
            <div className="text-[10px] text-verdant-muted font-bold">גיל {ev.age} · {ev.year}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
