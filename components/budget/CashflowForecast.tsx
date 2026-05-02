"use client";

/**
 * CashflowForecast — 12-month forward chart for /budget.
 * Built 2026-05-02 per Nir's "show what WILL be" brief.
 */

import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import { buildForecast, type ForecastMonth } from "@/lib/cashflow-forecast";

export function CashflowForecast() {
  const [months, setMonths] = useState<ForecastMonth[]>([]);

  useEffect(() => {
    setMonths(buildForecast());
    const refresh = () => setMonths(buildForecast());
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:assumptions", refresh);
    window.addEventListener("verdant:debt:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:assumptions", refresh);
      window.removeEventListener("verdant:debt:updated", refresh);
    };
  }, []);

  if (months.length === 0) return null;

  const max = Math.max(...months.map(m => Math.abs(m.netCashflow)), 1);
  const negativeMonths = months.filter(m => m.netCashflow < 0);

  return (
    <section className="card-pad mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted mb-0.5">
            תזרים 12 חודשים קדימה
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">מה צפוי לקרות בחשבון</h3>
        </div>
        {negativeMonths.length > 0 && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: "#FEE2E2", color: "#991B1B" }}
          >
            ⚠️ {negativeMonths.length} חודשים שליליים
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="grid grid-cols-12 gap-1 mb-4 items-end" style={{ minHeight: 120 }}>
        {months.map((m) => {
          const heightPct = (Math.abs(m.netCashflow) / max) * 100;
          const color = m.status === "negative" ? "#8B2E2E"
            : m.status === "tight" ? "#B45309"
            : "#1B4332";
          return (
            <div key={m.ym} className="flex flex-col items-center justify-end" style={{ height: 100 }} title={`${m.label}\n${fmtILS(m.netCashflow)}`}>
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(heightPct, 2)}%`,
                  background: color,
                  opacity: m.status === "negative" ? 0.95 : 0.8,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-12 gap-1 text-[9px] text-verdant-muted text-center mb-4">
        {months.map(m => (
          <div key={m.ym + "_lbl"}>{m.label.split(" ")[0].slice(0, 3)}</div>
        ))}
      </div>

      {/* Highlight events */}
      <div className="space-y-2">
        {months
          .filter(m => m.events.length > 0 || m.status !== "good")
          .slice(0, 4)
          .map(m => (
            <div
              key={m.ym}
              className="flex items-start gap-2 text-[12px] px-2.5 py-1.5 rounded-lg"
              style={{
                background: m.status === "negative" ? "#FEE2E2" : m.status === "tight" ? "#FEF3C7" : "#F4F7ED",
                color: m.status === "negative" ? "#991B1B" : m.status === "tight" ? "#92400E" : "#1B4332",
              }}
            >
              <span className="font-extrabold tabular-nums min-w-[80px]">{m.label}</span>
              <span className="font-bold tabular-nums min-w-[80px]">
                {m.netCashflow >= 0 ? "+" : ""}
                {fmtILS(m.netCashflow)}
              </span>
              <span className="flex-1">{m.events.length > 0 ? m.events.join(" · ") : "—"}</span>
            </div>
          ))}
      </div>

      <div className="text-[11px] text-verdant-muted mt-3">
        תחזית מבוססת על הכנסה והוצאות נוכחיות + עליית שכר {Math.round(((months[months.length-1]?.income || 0) / (months[0]?.income || 1) - 1) * 100)}% / 12 חודשים. אירועים חד-פעמיים (חופשה, חגים) מוערכים אוטומטית.
      </div>
    </section>
  );
}
