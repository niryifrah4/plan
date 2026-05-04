"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";
import { pmt, amortSchedule } from "@/lib/financial-math";

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
          <ResultCard label="תשלום חודשי" value={fmtILS(Math.round(monthly))} color="#1B4332" />
          <ResultCard
            label="סה״כ ריבית"
            value={fmtILS(Math.round(totalInterest))}
            color="#b91c1c"
          />
          <ResultCard label="סה״כ תשלום" value={fmtILS(Math.round(totalPaid))} color="#012d1d" />
        </div>

        {/* Interest vs Principal visual */}
        <div className="mb-4">
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">יחס קרן / ריבית</div>
          <div className="flex h-4 overflow-hidden rounded-full" style={{ background: "#eef2e8" }}>
            <div
              className="h-full"
              style={{ width: `${(principal / totalPaid) * 100}%`, background: "#1B4332" }}
            />
            <div
              className="h-full"
              style={{ width: `${(totalInterest / totalPaid) * 100}%`, background: "#b91c1c" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px] font-bold">
            <span style={{ color: "#1B4332" }}>
              קרן {Math.round((principal / totalPaid) * 100)}%
            </span>
            <span style={{ color: "#b91c1c" }}>
              ריבית {Math.round((totalInterest / totalPaid) * 100)}%
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold"
          style={{ background: "#1B433212", color: "#1B4332" }}
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
                  <td className="tabular py-1.5" style={{ color: "#b91c1c" }}>
                    {fmtILS(Math.round(row.totalInterest))}
                  </td>
                  <td className="tabular py-1.5" style={{ color: "#1B4332" }}>
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
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
        {label}
      </label>
      <div
        className="flex items-center rounded-lg border px-3 py-2"
        style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}
      >
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tabular flex-1 bg-transparent text-sm font-bold text-verdant-ink outline-none"
          dir="ltr"
        />
        {suffix && <span className="mr-1 text-xs font-bold text-verdant-muted">{suffix}</span>}
      </div>
    </div>
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
