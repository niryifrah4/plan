"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { loadAssumptions } from "@/lib/assumptions";

export function CompoundCalc() {
  const [lump, setLump]         = useState(50000);
  const [monthly, setMonthly]   = useState(2000);
  const [rate, setRate]         = useState(6);
  const [years, setYears]       = useState(20);
  const [showReal, setShowReal] = useState(false);
  const [inflation, setInflation] = useState(3);

  // Load from assumptions
  useEffect(() => {
    const a = loadAssumptions();
    setInflation(parseFloat((a.inflationRate * 100).toFixed(2)));
    setMonthly(Math.round(a.monthlyInvestment / 2));
    setRate(parseFloat((a.expectedReturnInvest * 100).toFixed(2)));
  }, []);

  const nominalRate = rate / 100;
  const realRate = Math.max(0, nominalRate - inflation / 100);
  const effectiveRate = showReal ? realRate : nominalRate;

  const fv = futureValue(lump, monthly, effectiveRate, years);
  const totalDeposited = lump + monthly * years * 12;
  const interest = fv - totalDeposited;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-verdant-ink text-right">פרמטרים</h3>
          <button
            onClick={() => setShowReal(!showReal)}
            className="text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
            style={{
              background: showReal ? "#1B433212" : "#1B433212",
              color: showReal ? "#1B4332" : "#1B4332",
            }}
          >
            <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
            {showReal ? `ריאלי (אחרי אינפלציה ${inflation}%)` : "נומינלי"}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">סכום פתיחה</span>
            <input type="number" value={lump} onChange={(e) => setLump(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr" />
          </label>
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">הפקדה חודשית</span>
            <input type="number" value={monthly} onChange={(e) => setMonthly(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr" />
          </label>
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">תשואה שנתית (%)</span>
            <input type="number" step="0.5" value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr" />
          </label>
          <label className="block">
            <span className="text-[11px] text-verdant-muted font-bold">שנות חיסכון</span>
            <input type="number" value={years} onChange={(e) => setYears(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border v-divider px-3 py-2 text-sm font-bold text-verdant-ink tabular bg-white focus:outline-none focus:ring-2 focus:ring-verdant-accent/40" dir="ltr" />
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-extrabold text-verdant-ink mb-4 text-right">
          תוצאות {showReal && <span className="text-xs font-bold" style={{ color: "#1B4332" }}>(ערכים ריאליים)</span>}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-lg border v-divider text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">סך הפקדות</div>
            <div className="text-xl font-extrabold tabular">{fmtILS(totalDeposited)}</div>
          </div>
          <div className="p-4 rounded-lg border v-divider text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">
              {showReal ? "ריבית ריאלית" : "ריבית מצטברת"}
            </div>
            <div className="text-xl font-extrabold tabular" style={{ color: "#1B4332" }}>{fmtILS(interest)}</div>
          </div>
          <div className="p-4 rounded-lg text-right" style={{ background: showReal ? "#1B433208" : "#1B433211", border: `1px solid ${showReal ? "#1B4332" : "#1B4332"}` }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">
              {showReal ? "שווי עתידי ריאלי" : "שווי עתידי (FV)"}
            </div>
            <div className="text-2xl font-extrabold tabular" style={{ color: showReal ? "#1B4332" : "#1B4332" }}>{fmtILS(fv)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
