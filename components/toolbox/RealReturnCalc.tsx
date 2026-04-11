"use client";

import { useState, useMemo, useEffect } from "react";
import { fmtILS, fmtPct } from "@/lib/format";
import { loadAssumptions, realReturn } from "@/lib/assumptions";
import { futureValue } from "@/lib/financial-math";

export function RealReturnCalc() {
  const [nominalReturn, setNominalReturn] = useState(6.5);
  const [inflation, setInflation] = useState(2.5);
  const [mgmtFee, setMgmtFee] = useState(0.8);
  const [investAmount, setInvestAmount] = useState(100000);
  const [years, setYears] = useState(20);

  useEffect(() => {
    const a = loadAssumptions();
    setInflation(parseFloat((a.inflationRate * 100).toFixed(2)));
    setMgmtFee(parseFloat((a.managementFeeInvest * 100).toFixed(2)));
    setNominalReturn(parseFloat((a.expectedReturnInvest * 100).toFixed(2)));
  }, []);

  const realRate = realReturn(nominalReturn / 100, inflation / 100, mgmtFee / 100);
  const nominalFV = futureValue(investAmount, 0, nominalReturn / 100, years);
  const realFV = futureValue(investAmount, 0, realRate, years);
  const feeDrag = futureValue(investAmount, 0, (nominalReturn - mgmtFee) / 100, years) - futureValue(investAmount, 0, nominalReturn / 100, years);

  return (
    <div className="space-y-6">
      <div className="v-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">analytics</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">תשואה ריאלית vs נומינלית</h3>
        </div>
        <p className="text-xs text-verdant-muted mb-5 leading-relaxed">
          מה נשאר לך באמת אחרי אינפלציה ודמי ניהול? תשואה נומינלית של 6.5% עם אינפלציה של 2.5% ודמי ניהול 0.8% — התשואה הריאלית נטו היא בסך הכל {fmtPct(realRate * 100, 2)}.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <Field label="תשואה נומינלית" value={nominalReturn} onChange={setNominalReturn} suffix="%" />
          <Field label="אינפלציה צפויה" value={inflation} onChange={setInflation} suffix="%" />
          <Field label="דמי ניהול" value={mgmtFee} onChange={setMgmtFee} suffix="%" />
          <Field label="סכום השקעה" value={investAmount} onChange={setInvestAmount} suffix="₪" />
          <Field label="שנים" value={years} onChange={setYears} suffix="" />
        </div>

        {/* Visual comparison */}
        <div className="rounded-xl p-4" style={{ background: "#f4f7ed" }}>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <div className="text-[10px] font-bold text-verdant-muted mb-1">תשואה נומינלית</div>
              <div className="text-lg font-extrabold tabular" style={{ color: "#012d1d" }}>{fmtPct(nominalReturn)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-verdant-muted mb-1">תשואה ריאלית נטו</div>
              <div className="text-lg font-extrabold tabular" style={{ color: realRate > 0 ? "#0a7a4a" : "#b91c1c" }}>{fmtPct(realRate * 100, 2)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-verdant-muted mb-1">הפסד לאינפלציה+דמ״נ</div>
              <div className="text-lg font-extrabold tabular" style={{ color: "#f59e0b" }}>{fmtPct(inflation + mgmtFee)}</div>
            </div>
          </div>

          {/* Bars */}
          <div className="space-y-3">
            <Bar label={`נומינלי (${years} שנים)`} value={nominalFV} max={nominalFV} color="#012d1d" />
            <Bar label={`ריאלי נטו (${years} שנים)`} value={realFV} max={nominalFV} color="#0a7a4a" />
          </div>

          <div className="mt-4 pt-3 border-t" style={{ borderColor: "#d8e0d0" }}>
            <div className="flex justify-between text-xs">
              <span className="text-verdant-muted">הפרש — כוח הקנייה שנאכל</span>
              <span className="font-extrabold tabular" style={{ color: "#b91c1c" }}>{fmtILS(nominalFV - realFV)}</span>
            </div>
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
      <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
          className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
        {suffix && <span className="text-xs text-verdant-muted font-bold">{suffix}</span>}
      </div>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] font-bold text-verdant-muted">{label}</span>
        <span className="text-[10px] font-extrabold tabular" style={{ color }}>{fmtILS(value)}</span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: "#eef2e8" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
