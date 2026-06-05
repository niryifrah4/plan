"use client";

/**
 * CashflowForecast — 12-month forward chart for /budget.
 * Built 2026-05-02 per Nir's "show what WILL be" brief.
 */

import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import { buildForecast, type ForecastMonth } from "@/lib/cashflow-forecast";
import { loadAssumptions, saveAssumptions } from "@/lib/assumptions";
import { fireSync } from "@/lib/sync-engine";

export function CashflowForecast() {
  const [months, setMonths] = useState<ForecastMonth[]>([]);
  const [growthPct, setGrowthPct] = useState<number>(0);

  useEffect(() => {
    setMonths(buildForecast());
    setGrowthPct(Math.round((loadAssumptions().salaryGrowthRate || 0) * 100));
    const refresh = () => {
      setMonths(buildForecast());
      setGrowthPct(Math.round((loadAssumptions().salaryGrowthRate || 0) * 100));
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:assumptions", refresh);
    window.addEventListener("verdant:debt:updated", refresh);
    window.addEventListener("verdant:special-events:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:assumptions", refresh);
      window.removeEventListener("verdant:debt:updated", refresh);
      window.removeEventListener("verdant:special-events:updated", refresh);
    };
  }, []);

  const updateGrowth = (newPct: number) => {
    const clamped = Math.max(0, Math.min(20, Math.round(newPct)));
    setGrowthPct(clamped);
    const a = loadAssumptions();
    a.salaryGrowthRate = clamped / 100;
    saveAssumptions(a);
    fireSync("verdant:assumptions");
  };

  // 2026-05-05 per ui-agent: don't return null silently — explain what's
  // missing. Otherwise the user sees a blank where the forecast should be
  // and never knows the panel exists.
  if (months.length === 0) {
    return (
      <section className="card-pad mb-6">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          תזרים 12 חודשים קדימה
        </div>
        <h3 className="mb-2 text-base font-extrabold text-verdant-ink">מה צפוי לקרות בחשבון</h3>
        <div
          className="rounded-xl px-4 py-5 text-center"
          style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB" }}
        >
          <div className="mb-1 text-[13px] font-bold text-verdant-ink">
            עוד אין תחזית להציג
          </div>
          <div className="text-[12px] text-verdant-muted leading-relaxed">
            הזינו הכנסות והוצאות בתקציב, והוסיפו אירועים מיוחדים ב-{" "}
            <a href="/goals" className="underline hover:text-verdant-emerald">
              מטרות
            </a>
            {" "}— התחזית תבנה אוטומטית.
          </div>
        </div>
      </section>
    );
  }

  const max = Math.max(...months.map((m) => Math.abs(m.netCashflow)), 1);
  const negativeMonths = months.filter((m) => m.netCashflow < 0);

  return (
    <section className="card-pad mb-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            תזרים 12 חודשים קדימה
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">מה צפוי לקרות בחשבון</h3>
        </div>
        {negativeMonths.length > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "rgba(220,38,38,0.12)", color: "#B91C1C" }}
          >
            <span className="material-symbols-outlined text-[14px]">warning</span>
            {negativeMonths.length} חודשים שליליים
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="mb-4 grid grid-cols-12 items-end gap-1" style={{ minHeight: 120 }}>
        {months.map((m) => {
          const heightPct = (Math.abs(m.netCashflow) / max) * 100;
          const color =
            m.status === "negative" ? "#DC2626" : m.status === "tight" ? "#B45309" : "#2C7A5A";
          return (
            <div
              key={m.ym}
              className="flex flex-col items-center justify-end"
              style={{ height: 100 }}
              title={`${m.label}\n${fmtILS(m.netCashflow)}`}
            >
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
      <div className="mb-4 grid grid-cols-12 gap-1 text-center text-[11px] font-semibold text-verdant-muted">
        {months.map((m) => (
          <div key={m.ym + "_lbl"}>{m.label.split(" ")[0].slice(0, 3)}</div>
        ))}
      </div>

      {/* Highlight events */}
      <div className="space-y-2">
        {months
          .filter((m) => m.events.length > 0 || m.status !== "good")
          .slice(0, 4)
          .map((m) => (
            <div
              key={m.ym}
              className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
              style={{
                background:
                  m.status === "negative"
                    ? "rgba(220,38,38,0.12)"
                    : m.status === "tight"
                      ? "rgba(217,119,6,0.12)"
                      : "#FAFAF7",
                color:
                  m.status === "negative"
                    ? "#B91C1C"
                    : m.status === "tight"
                      ? "#92400E"
                      : "#2C7A5A",
              }}
            >
              <span className="min-w-[80px] font-extrabold tabular-nums">{m.label}</span>
              <span className="min-w-[80px] font-bold tabular-nums">
                {fmtILS(m.netCashflow, { signed: true })}
              </span>
              <span className="flex-1">{m.events.length > 0 ? m.events.join(" · ") : "—"}</span>
            </div>
          ))}
      </div>

      {/* ═══════ Relief timeline — when do obligations free up cashflow? ═══════
          Pulls every "✅" event from the forecast (loan/installment/mortgage
          endings) and lists them by month. Built per Nir 2026-05-12 so a couple
          carrying credit-card installments can see exactly when each commitment
          drops off and how much each release adds back to their monthly margin. */}
      {(() => {
        const reliefMonths = months
          .map((m) => ({
            ...m,
            reliefEvents: m.events.filter((e) => e.startsWith("✅")),
          }))
          .filter((m) => m.reliefEvents.length > 0);

        if (reliefMonths.length === 0) return null;

        const totalMonthlyRelief = reliefMonths.reduce((sum, m) => {
          for (const ev of m.reliefEvents) {
            const match = ev.match(/₪([\d,]+)/);
            if (match) sum += parseInt(match[1].replace(/,/g, ""), 10) || 0;
          }
          return sum;
        }, 0);

        return (
          <div
            className="mt-4 rounded-xl"
            style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
          >
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ color: "#2C7A5A" }}
                >
                  trending_up
                </span>
                <div>
                  <div className="text-[13px] font-extrabold text-verdant-ink">
                    מה מתפנה תזרימית
                  </div>
                  <div className="text-[11px] font-semibold text-verdant-muted">
                    התחייבויות שמסתיימות ב-12 החודשים הקרובים
                  </div>
                </div>
              </div>
              {totalMonthlyRelief > 0 && (
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
                    סה״כ לשחרור
                  </div>
                  <div
                    className="text-[15px] font-extrabold tabular-nums"
                    style={{ color: "#2C7A5A" }}
                  >
                    {fmtILS(totalMonthlyRelief, { signed: true })}/ח׳
                  </div>
                </div>
              )}
            </div>
            <div
              className="space-y-1 px-4 pb-3 pt-1"
              style={{ borderTop: "1px solid #E5E7EB" }}
            >
              {reliefMonths.map((m) => (
                <div key={m.ym + "_relief"} className="flex items-start gap-3 pt-1.5 text-[12px]">
                  <span
                    className="min-w-[88px] shrink-0 font-extrabold"
                    style={{ color: "#1A1A1A" }}
                  >
                    {m.label}
                  </span>
                  <div className="flex-1 space-y-0.5">
                    {m.reliefEvents.map((ev, idx) => (
                      <div key={idx} style={{ color: "#2C7A5A" }}>
                        {ev.replace(/^✅\s*/, "")}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Adjustable assumption: annual salary growth */}
      <div
        className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-[11px]"
        style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
      >
        <label className="flex items-center gap-2 font-bold text-verdant-ink">
          צפי גידול שכר שנתי
          <input
            type="number"
            min={0}
            max={20}
            step={1}
            value={growthPct}
            onChange={(e) => updateGrowth(parseInt(e.target.value || "0"))}
            className="w-14 rounded-md border px-2 py-1 text-center font-extrabold tabular-nums"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
            dir="ltr"
          />
          <span>%</span>
        </label>
        <span className="text-verdant-muted">
          (קבע 0 לתחזית קבועה. ניתן להתאים — חישוב התחזית יתעדכן מיד.)
        </span>
      </div>

      <div className="mt-2 text-[11px] text-verdant-muted">
        אירועים מיוחדים (בונוס, החזרי מס, רכישות גדולות) — נכנסים מ-
        <a href="/goals" className="underline hover:text-verdant-emerald">
          /goals → אירועים מיוחדים
        </a>
        .
      </div>
    </section>
  );
}
