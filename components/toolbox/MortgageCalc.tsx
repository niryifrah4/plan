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
    () => showSchedule ? amortSchedule(principal, rate / 100, months) : [],
    [principal, rate, months, showSchedule],
  );

  // Yearly summary (every 12 months)
  const yearlySummary = useMemo(() => {
    if (!showSchedule || schedule.length === 0) return [];
    const summary: { year: number; totalPayment: number; totalInterest: number; totalPrincipal: number; endBalance: number }[] = [];
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
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-verdant-emerald">home</span>
          <h3 className="text-sm font-extrabold text-verdant-ink">מחשבון משכנתא</h3>
        </div>
        <p className="text-xs text-verdant-muted mb-5 leading-relaxed">
          חישוב תשלום חודשי, סך ריבית ולוח סילוקין מלא.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <Field label="סכום הלוואה" value={principal} onChange={setPrincipal} suffix="₪" />
          <Field label="ריבית שנתית" value={rate} onChange={setRate} suffix="%" step={0.1} />
          <Field label="תקופה (שנים)" value={years} onChange={setYears} />
        </div>

        {/* Results */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <ResultCard label="תשלום חודשי" value={fmtILS(Math.round(monthly))} color="#1B4332" />
          <ResultCard label="סה״כ ריבית" value={fmtILS(Math.round(totalInterest))} color="#b91c1c" />
          <ResultCard label="סה״כ תשלום" value={fmtILS(Math.round(totalPaid))} color="#012d1d" />
        </div>

        {/* Interest vs Principal visual */}
        <div className="mb-4">
          <div className="text-[9px] font-bold text-verdant-muted mb-1">יחס קרן / ריבית</div>
          <div className="h-4 rounded-full overflow-hidden flex" style={{ background: "#eef2e8" }}>
            <div className="h-full" style={{ width: `${(principal / totalPaid) * 100}%`, background: "#1B4332" }} />
            <div className="h-full" style={{ width: `${(totalInterest / totalPaid) * 100}%`, background: "#b91c1c" }} />
          </div>
          <div className="flex justify-between text-[9px] font-bold mt-1">
            <span style={{ color: "#1B4332" }}>קרן {Math.round((principal / totalPaid) * 100)}%</span>
            <span style={{ color: "#b91c1c" }}>ריבית {Math.round((totalInterest / totalPaid) * 100)}%</span>
          </div>
        </div>

        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
          style={{ background: "#1B433212", color: "#1B4332" }}
        >
          <span className="material-symbols-outlined text-[14px]">{showSchedule ? "visibility_off" : "visibility"}</span>
          {showSchedule ? "הסתר לוח סילוקין" : "הצג לוח סילוקין"}
        </button>
      </div>

      {/* Amortization Schedule */}
      {showSchedule && yearlySummary.length > 0 && (
        <div className="card-pad overflow-x-auto">
          <h4 className="text-sm font-extrabold text-verdant-ink mb-3">לוח סילוקין שנתי</h4>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-verdant-muted font-bold border-b v-divider">
                <th className="py-2 text-right">שנה</th>
                <th className="py-2 text-left tabular">תשלום שנתי</th>
                <th className="py-2 text-left tabular">ריבית</th>
                <th className="py-2 text-left tabular">קרן</th>
                <th className="py-2 text-left tabular">יתרה</th>
              </tr>
            </thead>
            <tbody>
              {yearlySummary.map(row => (
                <tr key={row.year} className="border-b v-divider">
                  <td className="py-1.5 font-bold text-verdant-ink">{row.year}</td>
                  <td className="py-1.5 tabular">{fmtILS(Math.round(row.totalPayment))}</td>
                  <td className="py-1.5 tabular" style={{ color: "#b91c1c" }}>{fmtILS(Math.round(row.totalInterest))}</td>
                  <td className="py-1.5 tabular" style={{ color: "#1B4332" }}>{fmtILS(Math.round(row.totalPrincipal))}</td>
                  <td className="py-1.5 tabular font-bold">{fmtILS(Math.round(row.endBalance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, suffix, step }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-verdant-muted uppercase tracking-[0.1em] block mb-1">{label}</label>
      <div className="flex items-center border rounded-lg px-3 py-2" style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}>
        <input type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))}
          className="flex-1 text-sm font-bold text-verdant-ink bg-transparent outline-none tabular" dir="ltr" />
        {suffix && <span className="text-xs text-verdant-muted font-bold mr-1">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded-xl text-center" style={{ background: `${color}08`, border: `1px solid ${color}15` }}>
      <div className="text-[9px] font-bold text-verdant-muted">{label}</div>
      <div className="text-base font-extrabold tabular" style={{ color }}>{value}</div>
    </div>
  );
}
