"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";

export function CompoundCalc() {
  const [lump, setLump]         = useState(50000);
  const [monthly, setMonthly]   = useState(2000);
  const [rate, setRate]         = useState(6);
  const [years, setYears]       = useState(20);

  const fv = futureValue(lump, monthly, rate / 100, years);
  const totalDeposited = lump + monthly * years * 12;
  const interest = fv - totalDeposited;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-extrabold text-verdant-ink mb-4 text-right">פרמטרים</h3>
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
        <h3 className="text-lg font-extrabold text-verdant-ink mb-4 text-right">תוצאות</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-lg border v-divider text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">סך הפקדות</div>
            <div className="text-xl font-extrabold tabular">{fmtILS(totalDeposited)}</div>
          </div>
          <div className="p-4 rounded-lg border v-divider text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">ריבית מצטברת</div>
            <div className="text-xl font-extrabold tabular" style={{ color: "#0a7a4a" }}>{fmtILS(interest)}</div>
          </div>
          <div className="p-4 rounded-lg text-right" style={{ background: "#0a7a4a11", border: "1px solid #0a7a4a" }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-1">שווי עתידי (FV)</div>
            <div className="text-2xl font-extrabold tabular" style={{ color: "#0a7a4a" }}>{fmtILS(fv)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
