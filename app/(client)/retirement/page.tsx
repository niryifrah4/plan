"use client";

import { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PensionCard } from "@/components/PensionCard";
import { MaslekaUpload } from "@/components/MaslekaUpload";
import { AlternativesCompare } from "@/components/AlternativesCompare";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { demoAssets, demoExposure } from "@/lib/stub-data";
import { loadAssumptions } from "@/lib/assumptions";
import type { Assumptions } from "@/lib/assumptions";

interface PensionFund {
  id: string;
  company: string;
  type: "pension" | "gemel" | "hishtalmut" | "bituach";
  balance: number;
  mgmtFeeDeposit: number;
  mgmtFeeBalance: number;
  track: string;
  monthlyContrib: number;
  insuranceCover?: { death: boolean; disability: boolean; lossOfWork: boolean };
}

const FUND_TYPE_LABELS: Record<string, string> = {
  pension: "פנסיה מקיפה",
  gemel: "קופת גמל",
  hishtalmut: "קרן השתלמות",
  bituach: "ביטוח מנהלים",
};
const FUND_TYPE_COLORS: Record<string, string> = {
  pension: "#0a7a4a",
  gemel: "#10b981",
  hishtalmut: "#1a6b42",
  bituach: "#125c38",
};

const demoFunds: PensionFund[] = [
  { id: "pf1", company: "מנורה מבטחים", type: "pension", balance: 240000, mgmtFeeDeposit: 1.5, mgmtFeeBalance: 0.22, track: "מסלול כללי", monthlyContrib: 2100,
    insuranceCover: { death: true, disability: true, lossOfWork: true } },
  { id: "pf2", company: "מגדל", type: "pension", balance: 95000, mgmtFeeDeposit: 2.0, mgmtFeeBalance: 0.35, track: "מניות", monthlyContrib: 800,
    insuranceCover: { death: true, disability: true, lossOfWork: false } },
  { id: "pf3", company: "הראל", type: "hishtalmut", balance: 45000, mgmtFeeDeposit: 0.0, mgmtFeeBalance: 0.8, track: "כללי", monthlyContrib: 850 },
  { id: "pf4", company: "אלטשולר שחם", type: "gemel", balance: 28000, mgmtFeeDeposit: 0.0, mgmtFeeBalance: 0.52, track: "מניות חו״ל", monthlyContrib: 500 },
];

export default function RetirementPage() {
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);

  useEffect(() => {
    setAssumptions(loadAssumptions());
    const handler = () => setAssumptions(loadAssumptions());
    window.addEventListener("verdant:assumptions", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("verdant:assumptions", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const currentAge = assumptions?.currentAge ?? 42;
  const retireAge = assumptions?.retirementAge ?? 67;
  const yearsToRetire = retireAge - currentAge;

  const pension = demoAssets
    .filter((a) => a.asset_group === "pension")
    .reduce((acc, a) => acc + a.balance, 0);

  const totalFundsBalance = demoFunds.reduce((s, f) => s + f.balance, 0);
  const totalMonthlyContrib = demoFunds.reduce((s, f) => s + f.monthlyContrib, 0);

  const weightedFee = useMemo(() => {
    if (totalFundsBalance === 0) return 0;
    return demoFunds.reduce((s, f) => s + f.mgmtFeeBalance * f.balance, 0) / totalFundsBalance;
  }, [totalFundsBalance]);

  const fundsByType = useMemo(() => {
    const groups: Record<string, PensionFund[]> = {};
    for (const f of demoFunds) {
      if (!groups[f.type]) groups[f.type] = [];
      groups[f.type].push(f);
    }
    return groups;
  }, []);

  // ─── Pension Simulation: year-by-year projection ───
  const simulation = useMemo(() => {
    const annualReturn = assumptions?.expectedReturnPension ?? 0.05;
    const inflRate = assumptions?.inflationRate ?? 0.025;
    const trajectory: { age: number; nominal: number; real: number }[] = [];
    let nominal = totalFundsBalance;
    let real = totalFundsBalance;
    const monthlyReal = totalMonthlyContrib;

    for (let y = 0; y <= yearsToRetire; y++) {
      trajectory.push({ age: currentAge + y, nominal: Math.round(nominal), real: Math.round(real) });
      nominal = futureValue(nominal, totalMonthlyContrib, annualReturn, 1);
      real = futureValue(real, monthlyReal, annualReturn - inflRate, 1);
    }

    const projectedNominal = trajectory[trajectory.length - 1]?.nominal ?? 0;
    const projectedReal = trajectory[trajectory.length - 1]?.real ?? 0;
    // Monthly pension estimate: 4% SWR / 12
    const monthlyPensionNominal = Math.round(projectedNominal * 0.04 / 12);
    const monthlyPensionReal = Math.round(projectedReal * 0.04 / 12);
    const monthlyIncome = assumptions?.monthlyIncome ?? 28500;
    const replacementRate = monthlyIncome > 0 ? monthlyPensionReal / monthlyIncome : 0;

    return { trajectory, projectedNominal, projectedReal, monthlyPensionNominal, monthlyPensionReal, replacementRate };
  }, [totalFundsBalance, totalMonthlyContrib, yearsToRetire, currentAge, assumptions]);

  // ─── Insurance Duplication Check ───
  const insuranceDuplication = useMemo(() => {
    const fundsWithInsurance = demoFunds.filter(f => f.insuranceCover);
    if (fundsWithInsurance.length < 2) return null;

    const deathCovers = fundsWithInsurance.filter(f => f.insuranceCover?.death);
    const disabilityCovers = fundsWithInsurance.filter(f => f.insuranceCover?.disability);
    const lowCovers = fundsWithInsurance.filter(f => f.insuranceCover?.lossOfWork);

    const duplicates: { type: string; label: string; funds: string[]; estimatedWaste: number }[] = [];
    if (deathCovers.length > 1) duplicates.push({ type: "death", label: "ביטוח חיים (מוות)", funds: deathCovers.map(f => f.company), estimatedWaste: 80 });
    if (disabilityCovers.length > 1) duplicates.push({ type: "disability", label: "אובדן כושר עבודה", funds: disabilityCovers.map(f => f.company), estimatedWaste: 120 });
    if (lowCovers.length > 1) duplicates.push({ type: "low", label: "פיצוי אבטלה", funds: lowCovers.map(f => f.company), estimatedWaste: 60 });

    return duplicates.length > 0 ? duplicates : null;
  }, []);

  // ─── Fee Impact Calculator ───
  const feeImpact = useMemo(() => {
    const highFee = weightedFee / 100;
    const lowFee = 0.25 / 100; // Optimal fee
    const years = yearsToRetire;
    const returnRate = assumptions?.expectedReturnPension ?? 0.05;

    const fvCurrent = futureValue(totalFundsBalance, totalMonthlyContrib, returnRate - highFee, years);
    const fvOptimal = futureValue(totalFundsBalance, totalMonthlyContrib, returnRate - lowFee, years);
    return { fvCurrent, fvOptimal, delta: fvOptimal - fvCurrent };
  }, [weightedFee, yearsToRetire, totalFundsBalance, totalMonthlyContrib, assumptions]);

  // ─── SVG Chart ───
  const chartW = 500, chartH = 140;
  const maxVal = Math.max(...simulation.trajectory.map(t => t.nominal), 1);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Retirement Lab · מעבדת פרישה"
        title="פנסיה ופרישה"
        description="סימולציית פנסיה, בדיקת כפילויות ביטוח, דמי ניהול ותכנון פרישה מקיף"
      />

      {/* ===== KPI Row ===== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="v-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[14px] text-verdant-muted">savings</span>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">צבירה פנסיונית</div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-ink tabular">{fmtILS(totalFundsBalance)}</div>
        </div>
        <div className="v-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[14px] text-verdant-muted">calendar_month</span>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">הפקדה חודשית</div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-emerald tabular">{fmtILS(totalMonthlyContrib)}</div>
        </div>
        <div className="v-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[14px] text-verdant-muted">percent</span>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">דמי ניהול ממוצעים</div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold tabular" style={{ color: weightedFee > 0.5 ? "#b91c1c" : "#0a7a4a" }}>
            {weightedFee.toFixed(2)}%
          </div>
          <div className="text-[10px] text-verdant-muted mt-0.5">מצבירה · ממוצע משוקלל</div>
        </div>
        <div className="v-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[14px] text-verdant-muted">elderly</span>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">שנים לפרישה</div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-ink tabular">{yearsToRetire}</div>
          <div className="text-[10px] text-verdant-muted mt-0.5">גיל {retireAge}</div>
        </div>
      </section>

      {/* ===== Pension Simulation Chart ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">show_chart</span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">סימולציית פנסיה</div>
              <h3 className="text-sm font-extrabold text-verdant-ink">צבירה צפויה עד גיל {retireAge}</h3>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#0a7a4a" }} /> נומינלי</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#58e1b0" }} /> ריאלי</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36">
          {/* Nominal area */}
          <path
            d={`M 0 ${chartH} ` + simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.nominal / maxVal) * (chartH - 8);
              return `L ${x} ${y}`;
            }).join(" ") + ` L ${chartW} ${chartH} Z`}
            fill="#0a7a4a" opacity="0.15"
          />
          {/* Nominal line */}
          <polyline
            points={simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.nominal / maxVal) * (chartH - 8);
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke="#0a7a4a" strokeWidth="2.5" strokeLinecap="round"
          />
          {/* Real line */}
          <polyline
            points={simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.real / maxVal) * (chartH - 8);
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke="#58e1b0" strokeWidth="2" strokeDasharray="6 3" strokeLinecap="round"
          />
          {/* End dots */}
          {(() => {
            const last = simulation.trajectory[simulation.trajectory.length - 1];
            const x = chartW;
            return <>
              <circle cx={x} cy={chartH - (last.nominal / maxVal) * (chartH - 8)} r="4" fill="#0a7a4a" stroke="#fff" strokeWidth="2" />
              <circle cx={x} cy={chartH - (last.real / maxVal) * (chartH - 8)} r="4" fill="#58e1b0" stroke="#fff" strokeWidth="2" />
            </>;
          })()}
        </svg>
        <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-1">
          <span>גיל {currentAge}</span>
          <span>גיל {retireAge}</span>
        </div>

        {/* Simulation results */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t v-divider">
          <div>
            <div className="text-[10px] text-verdant-muted font-bold mb-0.5">צבירה נומינלית</div>
            <div className="text-lg font-extrabold text-verdant-ink tabular">{fmtILS(simulation.projectedNominal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-verdant-muted font-bold mb-0.5">צבירה ריאלית</div>
            <div className="text-lg font-extrabold tabular" style={{ color: "#58e1b0" }}>{fmtILS(simulation.projectedReal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-verdant-muted font-bold mb-0.5">קצבה חודשית (ריאלי)</div>
            <div className="text-lg font-extrabold text-verdant-emerald tabular">{fmtILS(simulation.monthlyPensionReal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-verdant-muted font-bold mb-0.5">שיעור החלפה</div>
            <div className="text-lg font-extrabold tabular" style={{ color: simulation.replacementRate >= 0.7 ? "#0a7a4a" : "#b91c1c" }}>
              {(simulation.replacementRate * 100).toFixed(0)}%
            </div>
            <div className="text-[9px] text-verdant-muted">מומלץ: 70%+</div>
          </div>
        </div>
      </section>

      {/* ===== Pension Exposure Pie — All Instruments ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">donut_large</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">חשיפה מצרפית</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">חשיפה למדדים — פנסיה + השתלמות + עצמאי</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SVG Pie */}
          <div className="flex items-center justify-center">
            {(() => {
              const totalExp = demoExposure.reduce((s, e) => s + e.total, 0);
              const COLORS = ["#0a7a4a", "#10b981", "#1a6b42", "#58e1b0", "#f59e0b", "#8b5cf6"];
              let cum = 0;
              return (
                <svg viewBox="0 0 200 200" className="w-44 h-44">
                  {demoExposure.map((e, i) => {
                    const pct = totalExp > 0 ? e.total / totalExp : 0;
                    const angle = pct * 360;
                    const start = cum;
                    cum += angle;
                    if (pct < 0.01) return null;
                    const r = 80, cx = 100, cy = 100;
                    const sr = (start - 90) * Math.PI / 180;
                    const er = (start + angle - 90) * Math.PI / 180;
                    const la = angle > 180 ? 1 : 0;
                    return (
                      <path key={e.index}
                        d={`M ${cx} ${cy} L ${cx + r * Math.cos(sr)} ${cy + r * Math.sin(sr)} A ${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(er)} ${cy + r * Math.sin(er)} Z`}
                        fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="2" />
                    );
                  })}
                  <circle cx="100" cy="100" r="42" fill="#f9faf2" />
                  <text x="100" y="96" textAnchor="middle" className="text-[10px] font-bold" fill="#012d1d">חשיפה</text>
                  <text x="100" y="110" textAnchor="middle" className="text-[9px]" fill="#5a7a6a">מצרפית</text>
                </svg>
              );
            })()}
          </div>
          {/* Breakdown */}
          <div className="space-y-2">
            {demoExposure.map((e, i) => {
              const totalExp = demoExposure.reduce((s, x) => s + x.total, 0);
              const pct = totalExp > 0 ? (e.total / totalExp * 100).toFixed(1) : "0";
              const COLORS = ["#0a7a4a", "#10b981", "#1a6b42", "#58e1b0", "#f59e0b", "#8b5cf6"];
              return (
                <div key={e.index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#f4f7ed] transition-colors">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-verdant-ink">{e.index}</div>
                    <div className="flex gap-2 text-[9px] text-verdant-muted mt-0.5">
                      <span>פנסיה: {fmtILS(e.pension)}</span>
                      <span>השתלמות: {fmtILS(e.hishtalmut)}</span>
                      <span>עצמאי: {fmtILS(e.selfManaged)}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-extrabold tabular">{pct}%</div>
                    <div className="text-[10px] text-verdant-muted tabular">{fmtILS(e.total)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Insurance Duplication Alert ===== */}
      {insuranceDuplication && (
        <section className="rounded-2xl p-5 mb-6" style={{ background: "#fef3c7", border: "1.5px solid #f59e0b" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#f59e0b" }}>warning</span>
            <h3 className="text-sm font-extrabold" style={{ color: "#92400e" }}>כפילויות ביטוח שזוהו</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: "#92400e" }}>
            נמצאו כיסויים ביטוחיים כפולים בקרנות שלך. כפילויות עולות כסף ולא מוסיפות הגנה.
          </p>
          <div className="space-y-2">
            {insuranceDuplication.map(dup => (
              <div key={dup.type} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.7)" }}>
                <div>
                  <div className="text-xs font-extrabold" style={{ color: "#92400e" }}>{dup.label}</div>
                  <div className="text-[10px] text-verdant-muted mt-0.5">
                    כפול ב: {dup.funds.join(", ")}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-xs font-extrabold" style={{ color: "#b91c1c" }}>~₪{dup.estimatedWaste}/חודש</div>
                  <div className="text-[9px] text-verdant-muted">בזבוז משוער</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(245,158,11,0.3)" }}>
            <div className="text-xs font-extrabold" style={{ color: "#92400e" }}>
              חיסכון שנתי פוטנציאלי: ₪{(insuranceDuplication.reduce((s, d) => s + d.estimatedWaste, 0) * 12).toLocaleString("he-IL")}
            </div>
          </div>
        </section>
      )}

      {/* ===== Fee Impact Card ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[18px]" style={{ color: weightedFee > 0.5 ? "#b91c1c" : "#0a7a4a" }}>money_off</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">השפעת דמי ניהול</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">כמה דמי ניהול עולים לך לאורך {yearsToRetire} שנים?</h3>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-xl" style={{ background: "#f4f7ed" }}>
            <div className="text-[10px] text-verdant-muted font-bold mb-1">דמ"נ נוכחי ({weightedFee.toFixed(2)}%)</div>
            <div className="text-lg font-extrabold text-verdant-ink tabular">{fmtILS(feeImpact.fvCurrent)}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "#f0fdf4" }}>
            <div className="text-[10px] text-verdant-muted font-bold mb-1">דמ"נ אופטימלי (0.25%)</div>
            <div className="text-lg font-extrabold tabular" style={{ color: "#0a7a4a" }}>{fmtILS(feeImpact.fvOptimal)}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "#fef3c7" }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: "#92400e" }}>עלות דמ"נ עודפים</div>
            <div className="text-lg font-extrabold tabular" style={{ color: "#b91c1c" }}>{fmtILS(feeImpact.delta)}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="w-full h-3 rounded-full overflow-hidden flex" style={{ background: "#e5e7d8" }}>
            <div className="h-full" style={{ width: `${(feeImpact.fvCurrent / feeImpact.fvOptimal * 100).toFixed(1)}%`, background: "#0a7a4a" }} />
            <div className="h-full" style={{ width: `${(100 - feeImpact.fvCurrent / feeImpact.fvOptimal * 100).toFixed(1)}%`, background: "#f59e0b" }} />
          </div>
          <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-1">
            <span>מה תקבל</span>
            <span style={{ color: "#f59e0b" }}>מה דמ"נ אוכלים</span>
          </div>
        </div>
      </section>

      {/* ===== Tikun 190 Section ===== */}
      <section className="v-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">description</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">תיקון 190</div>
            <h3 className="text-sm font-extrabold text-verdant-ink">הטבות מס לקופות גמל להשקעה</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl" style={{ background: "#f0fdf4", border: "1px solid #0a7a4a20" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px] text-verdant-emerald">savings</span>
              <span className="text-xs font-extrabold text-verdant-ink">קופת גמל להשקעה</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-verdant-muted font-bold">
              <li className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[12px] text-verdant-emerald mt-0.5">check_circle</span>
                תקרת הפקדה: ₪79,005/שנה (2026)
              </li>
              <li className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[12px] text-verdant-emerald mt-0.5">check_circle</span>
                פטור ממס רווח הון בגיל 60+
              </li>
              <li className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[12px] text-verdant-emerald mt-0.5">check_circle</span>
                אפשרות משיכה כקצבה חודשית פטורה
              </li>
              <li className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[12px] text-verdant-emerald mt-0.5">check_circle</span>
                ניהול עצמאי — בחירת מסלול השקעה
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px] text-verdant-emerald">calculate</span>
              <span className="text-xs font-extrabold text-verdant-ink">סימולציית חיסכון מס</span>
            </div>
            {(() => {
              const annualDeposit = 79005;
              const years = retireAge - currentAge;
              const rate = (assumptions?.expectedReturnInvest ?? 0.065);
              const fvTax = futureValue(0, annualDeposit / 12, rate, years);
              const gains = fvTax - annualDeposit * years;
              const taxSaved = gains * 0.25;
              return (
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-verdant-muted font-bold">הפקדה מקסימלית</span>
                    <span className="font-extrabold text-verdant-ink tabular">₪{annualDeposit.toLocaleString("he-IL")}/שנה</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-verdant-muted font-bold">צבירה צפויה (גיל {retireAge})</span>
                    <span className="font-extrabold text-verdant-ink tabular">{fmtILS(fvTax)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-verdant-muted font-bold">רווחים צפויים</span>
                    <span className="font-extrabold tabular" style={{ color: "#0a7a4a" }}>{fmtILS(gains)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-2 border-t v-divider">
                    <span className="font-bold" style={{ color: "#0a7a4a" }}>חיסכון מס צפוי</span>
                    <span className="font-extrabold tabular text-lg" style={{ color: "#0a7a4a" }}>{fmtILS(taxSaved)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ===== Pension Projection + Card ===== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">צבירה נוכחית</div>
          <div className="text-2xl font-extrabold text-verdant-ink tabular">{fmtILS(pension)}</div>
          <div className="text-[11px] text-verdant-muted mt-1">מכלל הקרנות הפנסיוניות</div>
        </div>
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">צפי בפרישה (ריאלי)</div>
          <div className="text-2xl font-extrabold text-verdant-emerald tabular">{fmtILS(simulation.projectedReal)}</div>
          <div className="text-[11px] text-verdant-muted mt-1">תשואה {((assumptions?.expectedReturnPension ?? 0.05) * 100).toFixed(1)}% · {yearsToRetire} שנים</div>
        </div>
        <PensionCard monthlyPension={simulation.monthlyPensionReal} replacementRate={simulation.replacementRate} />
      </section>

      {/* ===== Pension Funds Table ===== */}
      <section className="v-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b v-divider flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-verdant-ink">קרנות פנסיה וחיסכון</h2>
            <p className="text-[11px] text-verdant-muted mt-0.5">{demoFunds.length} קרנות · מעודכן מהמסלקה הפנסיונית</p>
          </div>
        </div>

        {Object.entries(fundsByType).map(([type, funds]) => (
          <div key={type}>
            <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: "#f4f7ed" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: FUND_TYPE_COLORS[type] || "#0a7a4a" }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">
                {FUND_TYPE_LABELS[type] || type}
              </span>
            </div>
            {funds.map(f => (
              <div key={f.id} className="px-5 py-3.5 border-b v-divider flex items-center justify-between hover:bg-[#f9faf2] transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-extrabold text-verdant-ink">{f.company}</div>
                    {f.insuranceCover && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                        כולל ביטוח
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-verdant-muted mt-0.5">
                    מסלול: {f.track} · הפקדה: {fmtILS(f.monthlyContrib)}/חודש
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-left">
                    <div className="text-[10px] text-verdant-muted font-bold">דמי ניהול</div>
                    <div className="text-xs font-extrabold tabular" style={{ color: f.mgmtFeeBalance > 0.5 ? "#b91c1c" : "#0a7a4a" }}>
                      {f.mgmtFeeDeposit}% הפקדה · {f.mgmtFeeBalance}% צבירה
                    </div>
                  </div>
                  <div className="text-left min-w-[100px]">
                    <div className="text-[10px] text-verdant-muted font-bold">יתרה</div>
                    <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(f.balance)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* ===== Masleka Upload + Fee Comparison ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <MaslekaUpload />
        <AlternativesCompare
          title="השוואת דמי ניהול פנסיה"
          horizonYears={yearsToRetire}
          current={{  label: "מצב נוכחי",  lumpToday: totalFundsBalance, monthly: totalMonthlyContrib, annualRate: 0.047 }}
          proposed={{ label: "מצב מוצע",   lumpToday: totalFundsBalance, monthly: totalMonthlyContrib, annualRate: 0.053 }}
          note="הפער נובע מהפחתת דמי ניהול מ-1.0% ל-0.4%, שמשפרת את התשואה נטו ב-0.6% לשנה."
        />
      </div>

      {/* ===== Retirement Insight ===== */}
      <div className="rounded-2xl p-5 md:p-6" style={{ background: "linear-gradient(135deg,#012d1d 0%,#064e32 50%,#0a7a4a 100%)", color: "#fff" }}>
        <div className="flex items-start gap-3 md:gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(88,225,176,0.2)" }}>
            <span className="material-symbols-outlined" style={{ color: "#58e1b0" }}>elderly</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2" style={{ color: "#58e1b0" }}>תובנת פרישה</div>
            <h3 className="text-base md:text-lg font-extrabold mb-2">
              שיעור החלפת הכנסה: {(simulation.replacementRate * 100).toFixed(0)}%
            </h3>
            <p className="text-xs md:text-sm opacity-90 leading-relaxed">
              {simulation.replacementRate >= 0.8
                ? "הפנסיה הצפויה שלכם מכסה 80%+ מההכנסה — מצוין! שמרו על קצב ההפקדות."
                : simulation.replacementRate >= 0.7
                  ? "הפנסיה הצפויה סבירה. שקלו הגדלת הפקדות או הפחתת דמי ניהול לשיפור."
                  : "שיעור ההחלפה נמוך. מומלץ להגדיל הפקדות, להפחית דמי ניהול, או להוסיף קופת גמל להשקעה (תיקון 190)."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
