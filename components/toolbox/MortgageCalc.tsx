"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { pmt, amortSchedule } from "@/lib/financial-math";
import { ToolboxNumberField } from "@/components/toolbox/ToolboxNumberField";

export function MortgageCalc() {
  const [principal, setPrincipal] = useState(1500000);
  const [rate, setRate] = useState(4.5);
  const [years, setYears] = useState(25);
  const [showSchedule, setShowSchedule] = useState(false);

  const months = years * 12;
  const monthly = pmt(principal, rate / 100, months);
  const totalPaid = monthly * months;
  const totalInterest = totalPaid - principal;

  const schedule = useMemo(
    () => (showSchedule ? amortSchedule(principal, rate / 100, months) : []),
    [principal, rate, months, showSchedule]
  );

  // Yearly summary (every 12 months)
  const yearlySummary = useMemo(() => {
    if (!showSchedule || schedule.length === 0) return [];
    const summary: {
      year: number;
      totalPayment: number;
      totalInterest: number;
      totalPrincipal: number;
      endBalance: number;
    }[] = [];
    for (let y = 1; y <= years; y++) {
      const slice = schedule.slice((y - 1) * 12, y * 12);
      summary.push({
        year: y,
        totalPayment: slice.reduce((s, r) => s + r.payment, 0),
        totalInterest: slice.reduce((s, r) => s + r.interest, 0),
        totalPrincipal: slice.reduce((s, r) => s + r.principal, 0),
        endBalance: slice[slice.length - 1]?.balance ?? 0,
      });
    }
    return summary;
  }, [schedule, years]);

  return (
    <div className="space-y-6">
      <div className="card-pad">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-verdant-emerald">home</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">מחשבון משכנתא</h3>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-verdant-muted">
          חישוב תשלום חודשי, סך ריבית ולוח סילוקין מלא.
        </p>

        <div className="mb-5 grid grid-cols-3 gap-4">
          <Field label="סכום הלוואה" value={principal} onChange={setPrincipal} suffix="₪" />
          <Field label="ריבית שנתית" value={rate} onChange={setRate} suffix="%" step={0.1} />
          <Field label="תקופה (שנים)" value={years} onChange={setYears} />
        </div>

        {/* Results */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <ResultCard label="תשלום חודשי" value={fmtILS(Math.round(monthly))} color="#2C7A5A" />
          <ResultCard
            label="סה״כ ריבית"
            value={fmtILS(Math.round(totalInterest))}
            color="#DC2626"
          />
          <ResultCard label="סה״כ תשלום" value={fmtILS(Math.round(totalPaid))} color="#FFFFFF" />
        </div>

        {/* Interest vs Principal visual */}
        <div className="mb-4">
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">יחס קרן / ריבית</div>
          <div className="flex h-4 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
            <div
              className="h-full"
              style={{ width: `${(principal / totalPaid) * 100}%`, background: "#2C7A5A" }}
            />
            <div
              className="h-full"
              style={{ width: `${(totalInterest / totalPaid) * 100}%`, background: "#DC2626" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px] font-bold">
            <span style={{ color: "#2C7A5A" }}>
              קרן {Math.round((principal / totalPaid) * 100)}%
            </span>
            <span style={{ color: "#DC2626" }}>
              ריבית {Math.round((totalInterest / totalPaid) * 100)}%
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold"
          style={{ background: "#2C7A5A12", color: "#2C7A5A" }}
        >
          <span className="material-symbols-outlined text-[14px]">
            {showSchedule ? "visibility_off" : "visibility"}
          </span>
          {showSchedule ? "הסתר לוח סילוקין" : "הצג לוח סילוקין"}
        </button>
      </div>

      {/* Amortization Schedule */}
      {showSchedule && yearlySummary.length > 0 && (
        <div className="card-pad overflow-x-auto">
          <h4 className="mb-3 text-sm font-extrabold text-verdant-ink">לוח סילוקין שנתי</h4>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="v-divider border-b font-bold text-verdant-muted">
                <th className="py-2 text-right">שנה</th>
                <th className="tabular py-2 text-left">תשלום שנתי</th>
                <th className="tabular py-2 text-left">ריבית</th>
                <th className="tabular py-2 text-left">קרן</th>
                <th className="tabular py-2 text-left">יתרה</th>
              </tr>
            </thead>
            <tbody>
              {yearlySummary.map((row) => (
                <tr key={row.year} className="v-divider border-b">
                  <td className="py-1.5 font-bold text-verdant-ink">{row.year}</td>
                  <td className="tabular py-1.5">{fmtILS(Math.round(row.totalPayment))}</td>
                  <td className="tabular py-1.5" style={{ color: "#DC2626" }}>
                    {fmtILS(Math.round(row.totalInterest))}
                  </td>
                  <td className="tabular py-1.5" style={{ color: "#2C7A5A" }}>
                    {fmtILS(Math.round(row.totalPrincipal))}
                  </td>
                  <td className="tabular py-1.5 font-bold">{fmtILS(Math.round(row.endBalance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <ToolboxNumberField
      label={label}
      value={value}
      onChange={onChange}
      suffix={suffix}
      min={0}
      steps={step && step < 1 ? [step, step * 5, step * 10] : undefined}
      compact
    />
  );
}

function ResultCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: `${color}08`, border: `1px solid ${color}15` }}
    >
      <div className="text-[9px] font-bold text-verdant-muted">{label}</div>
      <div className="tabular text-base font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
