"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { loadAssumptions } from "@/lib/assumptions";
import { ToolboxNumberField } from "@/components/toolbox/ToolboxNumberField";

export function CompoundCalc() {
  const [lump, setLump] = useState(50000);
  const [monthly, setMonthly] = useState(2000);
  const [rate, setRate] = useState(6);
  const [years, setYears] = useState(20);
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
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-right text-lg font-extrabold text-verdant-ink">פרמטרים</h3>
          <button
            onClick={() => setShowReal(!showReal)}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold transition-colors"
            style={{
              background: showReal ? "#2C7A5A12" : "#2C7A5A12",
              color: showReal ? "#2C7A5A" : "#2C7A5A",
            }}
          >
            <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
            {showReal ? `ריאלי (אחרי אינפלציה ${inflation}%)` : "נומינלי"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ToolboxNumberField
            label="סכום פתיחה"
            value={lump}
            onChange={setLump}
            suffix="₪"
            min={0}
          />
          <ToolboxNumberField
            label="הפקדה חודשית"
            value={monthly}
            onChange={setMonthly}
            suffix="₪"
            min={0}
          />
          <ToolboxNumberField
            label="תשואה שנתית"
            value={rate}
            onChange={setRate}
            suffix="%"
            min={0}
            steps={[0.1, 0.5, 1]}
          />
          <ToolboxNumberField
            label="שנות חיסכון"
            value={years}
            onChange={setYears}
            min={0}
            steps={[1, 5, 10]}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-right text-lg font-extrabold text-verdant-ink">
          תוצאות{" "}
          {showReal && (
            <span className="text-xs font-bold" style={{ color: "#2C7A5A" }}>
              (ערכים ריאליים)
            </span>
          )}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="v-divider rounded-lg border p-4 text-right">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              סך הפקדות
            </div>
            <div className="tabular text-xl font-extrabold">{fmtILS(totalDeposited)}</div>
          </div>
          <div className="v-divider rounded-lg border p-4 text-right">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              {showReal ? "ריבית ריאלית" : "ריבית מצטברת"}
            </div>
            <div className="tabular text-xl font-extrabold" style={{ color: "#2C7A5A" }}>
              {fmtILS(interest)}
            </div>
          </div>
          <div
            className="rounded-lg p-4 text-right"
            style={{
              background: showReal ? "#2C7A5A08" : "#2C7A5A11",
              border: `1px solid ${showReal ? "#2C7A5A" : "#2C7A5A"}`,
            }}
          >
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              {showReal ? "שווי עתידי ריאלי" : "שווי עתידי (FV)"}
            </div>
            <div
              className="tabular text-2xl font-extrabold"
              style={{ color: showReal ? "#2C7A5A" : "#2C7A5A" }}
            >
              {fmtILS(fv)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
