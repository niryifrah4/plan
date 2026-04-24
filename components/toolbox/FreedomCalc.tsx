"use client";

import { useState, useMemo, useEffect } from "react";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { loadAssumptions, freedomNumber } from "@/lib/assumptions";
import { dynamicFreedomNumber } from "@/lib/intelligence-engine";

export function FreedomCalc() {
  const [monthlyExpense, setMonthlyExpense] = useState(27000);
  const [currentAssets, setCurrentAssets] = useState(608000);
  const [monthlySavings, setMonthlySavings] = useState(5600);
  const [annualReturn, setAnnualReturn] = useState(6.5);
  const [inflation, setInflation] = useState(2.5);
  const [mgmtFee, setMgmtFee] = useState(0.8);
  const [currentAge, setCurrentAge] = useState(42);

  // Load from assumptions & listen for changes
  useEffect(() => {
    const load = () => {
      const a = loadAssumptions();
      setMonthlyExpense(a.monthlyExpenses);
      setMonthlySavings(a.monthlyInvestment);
      setInflation(parseFloat((a.inflationRate * 100).toFixed(2)));
      setMgmtFee(parseFloat((a.managementFeeInvest * 100).toFixed(2)));
      setAnnualReturn(parseFloat((a.expectedReturnInvest * 100).toFixed(2)));
      setCurrentAge(a.currentAge);
    };
    load();
    const handler = () => load();
    window.addEventListener("verdant:assumptions", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("verdant:assumptions", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Dynamic Rule of 300 — adjusts for real-world drag
  const dynamic = useMemo(
    () => dynamicFreedomNumber(monthlyExpense, inflation / 100, mgmtFee / 100),
    [monthlyExpense, inflation, mgmtFee],
  );
  const staticNum = freedomNumber(monthlyExpense);

  const simulation = useMemo(() => {
    const rate = annualReturn / 100;
    let balance = currentAssets;
    const trajectory: { year: number; balance: number }[] = [{ year: 0, balance }];
    for (let year = 1; year <= 60; year++) {
      balance = futureValue(balance, monthlySavings, rate, 1);
      trajectory.push({ year, balance });
      if (balance >= dynamic.freedomNumber && trajectory.length <= year + 1) {
        // Keep going to fill the chart but mark the crossing
      }
    }
    const freedomYear = trajectory.findIndex(t => t.balance >= dynamic.freedomNumber);
    return {
      years: freedomYear > 0 ? freedomYear : 60,
      age: currentAge + (freedomYear > 0 ? freedomYear : 60),
      finalBalance: trajectory[freedomYear > 0 ? freedomYear : trajectory.length - 1].balance,
      trajectory: trajectory.slice(0, 41), // Up to 40 years
    };
  }, [monthlyExpense, currentAssets, monthlySavings, annualReturn, dynamic.freedomNumber, currentAge]);

  const pct = Math.min(100, (currentAssets / dynamic.freedomNumber) * 100);

  // Mini chart dimensions
  const chartW = 500, chartH = 120;
  const maxVal = Math.max(dynamic.freedomNumber, ...simulation.trajectory.map(t => t.balance));

  return (
    <div className="space-y-6">
      {/* Hero card — Dynamic Freedom Number */}
      <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#012d1d 0%,#064e32 50%,#1B4332 100%)", color: "#fff" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 20% 80%, #2B694D 0%, transparent 50%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[22px]" style={{ color: "#2B694D" }}>workspace_premium</span>
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: "#2B694D" }}>חוק ה-300 הדינמי</span>
          </div>
          <div className="flex items-baseline gap-3 mb-1">
            <div className="text-3xl font-extrabold tabular">{fmtILS(dynamic.freedomNumber)}</div>
            <span className="text-[10px] opacity-60">מכפיל: ×{dynamic.multiplier}</span>
          </div>
          <p className="text-xs opacity-70 mb-1">
            מותאם לאינפלציה ({inflation}%) ודמי ניהול ({mgmtFee}%) — SWR ריאלי: {(dynamic.realSWR * 100).toFixed(2)}%
          </p>

          {dynamic.multiplier > 300 && (
            <div className="flex items-center gap-1.5 mt-2 mb-3 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(245,158,11,0.2)" }}>
              <span className="material-symbols-outlined text-[14px]" style={{ color: "#fbbf24" }}>info</span>
              <span className="text-[10px] font-bold" style={{ color: "#fbbf24" }}>
                בגלל אינפלציה ודמי ניהול, המכפיל עלה מ-300 ל-{dynamic.multiplier}. נדרש הון גבוה יותר!
              </span>
            </div>
          )}

          {/* Comparison: static vs dynamic */}
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            <div>
              <div className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">חוק 300 הקלאסי</div>
              <div className="text-sm font-bold tabular opacity-70">{fmtILS(staticNum)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest opacity-50 mb-0.5">הפרש דינמי</div>
              <div className="text-sm font-bold tabular" style={{ color: "#fbbf24" }}>+{fmtILS(dynamic.freedomNumber - staticNum)}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="w-full h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2B694D,#2B694D)" }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] opacity-60">
              <span>הושג {pct.toFixed(1)}%</span>
              <span>חסר {fmtILS(Math.max(0, dynamic.freedomNumber - currentAssets))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trajectory mini chart */}
      <div className="card-pad">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-extrabold text-verdant-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-verdant-emerald">show_chart</span>
            מסלול לחופש כלכלי
          </h3>
          <span className="text-[10px] text-verdant-muted font-bold">40 שנים</span>
        </div>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-28">
          {/* Freedom line */}
          <line x1="0" x2={chartW} y1={chartH - (dynamic.freedomNumber / maxVal) * chartH} y2={chartH - (dynamic.freedomNumber / maxVal) * chartH}
            stroke="#f59e0b" strokeDasharray="6 4" strokeWidth="1.5" opacity="0.6" />
          {/* Area fill */}
          <path
            d={`M 0 ${chartH} ` + simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.balance / maxVal) * (chartH - 4);
              return `L ${x} ${y}`;
            }).join(" ") + ` L ${chartW} ${chartH} Z`}
            fill="url(#freedomGrad)" opacity="0.3"
          />
          {/* Line */}
          <polyline
            points={simulation.trajectory.map((t, i) => {
              const x = (i / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
              const y = chartH - (t.balance / maxVal) * (chartH - 4);
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke="#1B4332" strokeWidth="2.5" strokeLinecap="round"
          />
          {/* Freedom crossing dot */}
          {simulation.years <= 40 && (() => {
            const x = (simulation.years / Math.max(simulation.trajectory.length - 1, 1)) * chartW;
            const y = chartH - (dynamic.freedomNumber / maxVal) * (chartH - 4);
            return <circle cx={x} cy={y} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />;
          })()}
          <defs>
            <linearGradient id="freedomGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B4332" />
              <stop offset="100%" stopColor="#1B4332" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-1">
          <span>היום</span>
          <span style={{ color: "#f59e0b" }}>קו החופש</span>
          <span>+40 שנים</span>
        </div>
      </div>

      {/* Input fields */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="הוצאה חודשית" value={monthlyExpense} onChange={setMonthlyExpense} suffix="₪" />
        <Field label="נכסים נוכחיים" value={currentAssets} onChange={setCurrentAssets} suffix="₪" />
        <Field label="חיסכון חודשי" value={monthlySavings} onChange={setMonthlySavings} suffix="₪" />
        <Field label="תשואה שנתית" value={annualReturn} onChange={setAnnualReturn} suffix="%" />
        <Field label="אינפלציה צפויה" value={inflation} onChange={setInflation} suffix="%" />
        <Field label="דמי ניהול" value={mgmtFee} onChange={setMgmtFee} suffix="%" />
      </div>

      {/* Results */}
      <div className="card-pad">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-verdant-emerald">emoji_events</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">תוצאת הסימולציה</h3>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-verdant-ink tabular">{simulation.years}</div>
            <div className="text-[10px] text-verdant-muted font-bold">שנים לחופש</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular" style={{ color: "#1B4332" }}>{simulation.age}</div>
            <div className="text-[10px] text-verdant-muted font-bold">גיל חופש כלכלי</div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-verdant-ink tabular">{fmtILS(simulation.finalBalance)}</div>
            <div className="text-[10px] text-verdant-muted font-bold">יתרה צפויה</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">{label}</label>
      <div className="flex items-center gap-1 border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
          className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
        <span className="text-xs text-verdant-muted font-bold">{suffix}</span>
      </div>
    </div>
  );
}
