"use client";

import { useState, useMemo } from "react";
import { fmtILS, fmtPct } from "@/lib/format";
import { israeliIncomeTax, bituachLeumiEstimate } from "@/lib/assumptions";
import { capitalGainsTax } from "@/lib/financial-math";

type IncomeType = "employment" | "passive";

export function TaxCalc() {
  const [monthlyGross, setMonthlyGross] = useState(28500);
  const [incomeType, setIncomeType] = useState<IncomeType>("employment");
  const [capitalGains, setCapitalGains] = useState(0);
  const [costBasis, setCostBasis] = useState(0);
  const [creditPoints, setCreditPoints] = useState(2.25);

  const annualIncome = monthlyGross * 12;

  const incomeTax = useMemo(() => israeliIncomeTax(annualIncome), [annualIncome]);
  const bituachLeumi = useMemo(() => bituachLeumiEstimate(monthlyGross), [monthlyGross]);
  const cgt = useMemo(() => capitalGainsTax(costBasis, costBasis + capitalGains), [capitalGains, costBasis]);

  // נקודות זיכוי: 1 נקודה = ₪2,904/שנה (2025) = ₪242/חודש
  const creditPerPointMonthly = 242;
  const monthlyCredit = creditPoints * creditPerPointMonthly;
  const monthlyIncomeTax = Math.max(0, incomeTax.tax / 12 - monthlyCredit);

  const totalMonthlyDeductions = monthlyIncomeTax + bituachLeumi.monthly;
  const netMonthly = monthlyGross - totalMonthlyDeductions;

  return (
    <div className="space-y-6">
      {/* Income Tax Section */}
      <div className="card-pad">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">receipt_long</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">מס הכנסה שולי</h3>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">משכורת ברוטו חודשית</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={monthlyGross} onChange={e => setMonthlyGross(Number(e.target.value))}
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">₪</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">נקודות זיכוי</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={creditPoints} onChange={e => setCreditPoints(Number(e.target.value))} step="0.25"
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">סוג הכנסה</label>
            <select value={incomeType} onChange={e => setIncomeType(e.target.value as IncomeType)}
              className="w-full text-sm font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <option value="employment">יגיעה אישית (שכיר/עצמאי)</option>
              <option value="passive">שלא מיגיעה (השקעות, שכ&quot;ד)</option>
            </select>
          </div>
        </div>

        {/* Tax breakdown */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#f4f7ed" }}>
          <Row label="הכנסה שנתית" value={fmtILS(annualIncome)} />
          <Row label="מס הכנסה לפני זיכוי" value={fmtILS(incomeTax.tax / 12)} color="#b91c1c" />
          <Row label={`זיכוי נקודות (${creditPoints})`} value={`-${fmtILS(monthlyCredit)}`} color="#1B4332" />
          <Row label="מס הכנסה חודשי" value={fmtILS(monthlyIncomeTax)} color="#b91c1c" />
          <Row label="שיעור מס אפקטיבי" value={fmtPct(annualIncome > 0 ? (monthlyIncomeTax * 12 / annualIncome) * 100 : 0)} />
          <Row label="מדרגת מס שולי" value={fmtPct(incomeTax.marginalBracket * 100)} color="#b91c1c" />
          <div className="border-t pt-2" style={{ borderColor: "#d8e0d0" }}>
            <Row label="ביטוח לאומי חודשי" value={fmtILS(bituachLeumi.monthly)} color="#b91c1c" />
          </div>
          <div className="border-t pt-2" style={{ borderColor: "#d8e0d0" }}>
            <Row label="נטו חודשי (אומדן)" value={fmtILS(netMonthly)} bold color="#1B4332" />
          </div>
        </div>
      </div>

      {/* Capital Gains Section */}
      <div className="card-pad">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">trending_up</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">מס רווח הון</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">עלות מקורית</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={costBasis} onChange={e => setCostBasis(Number(e.target.value))}
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">₪</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">רווח הון</label>
            <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
              <input type="number" value={capitalGains} onChange={e => setCapitalGains(Number(e.target.value))}
                className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
              <span className="text-xs text-verdant-muted font-bold">₪</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4 space-y-3" style={{ background: "#f4f7ed" }}>
          <Row label="רווח הון נומינלי" value={fmtILS(cgt.gain)} />
          <Row label="מס רווח הון (25%)" value={fmtILS(cgt.tax)} color="#b91c1c" />
          <Row label="נטו לאחר מס" value={fmtILS(cgt.netAfterTax)} bold color="#1B4332" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-verdant-muted">{label}</span>
      <span className={`text-xs tabular ${bold ? "font-extrabold" : "font-bold"}`} style={{ color: color || "#012d1d" }}>{value}</span>
    </div>
  );
}
