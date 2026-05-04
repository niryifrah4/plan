"use client";

/**
 * /roadmap — מסלול חיי המשפחה.
 *
 * Built 2026-05-02 per Nir. Single-page view of the next 20 years:
 * key life events on a timeline + projected net worth on a sparkline.
 * No editing here — this is a read-only "story of where we're going".
 */

import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import { buildFamilyRoadmap, type RoadmapEvent, type FamilyRoadmap } from "@/lib/family-roadmap";

const CATEGORY_COLOR: Record<RoadmapEvent["category"], string> = {
  kid: "#7C2D12",
  goal: "#1B4332",
  debt: "#0F766E",
  retirement: "#B45309",
  milestone: "#6B21A8",
};

export default function RoadmapPage() {
  const [data, setData] = useState<FamilyRoadmap | null>(null);

  useEffect(() => {
    setData(buildFamilyRoadmap());
    const refresh = () => setData(buildFamilyRoadmap());
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:goals:updated", refresh);
    window.addEventListener("verdant:assumptions", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:goals:updated", refresh);
      window.removeEventListener("verdant:assumptions", refresh);
    };
  }, []);

  if (!data) return <div className="mx-auto max-w-5xl p-6 text-verdant-muted">טוען...</div>;

  const { events, netWorthSeries, startNetWorth, endNetWorth, retirementYear } = data;
  const nwMax = Math.max(...netWorthSeries.map((p) => p.netWorth), 1);

  return (
    <div className="mx-auto max-w-5xl" dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          מסלול חיים · 20 שנים קדימה
        </div>
        <h1 className="text-2xl font-extrabold text-verdant-ink">איך תיראה המשפחה במסלול הנוכחי</h1>
      </div>

      {/* Net worth start vs end */}
      <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #eef2e8" }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
            היום
          </div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-verdant-ink">
            {fmtILS(startNetWorth)}
          </div>
          <div className="mt-0.5 text-[11px] text-verdant-muted">הון נטו נוכחי</div>
        </div>
        {retirementYear && (
          <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #eef2e8" }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              בפרישה
            </div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-verdant-ink">
              {fmtILS(
                netWorthSeries.find((p) => p.year >= retirementYear)?.netWorth || endNetWorth
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-verdant-muted">{retirementYear}</div>
          </div>
        )}
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
            color: "#F9FAF2",
          }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            בעוד {netWorthSeries.length - 1} שנים
          </div>
          <div
            className="mt-1 text-2xl font-extrabold tabular-nums"
            style={{ fontFamily: "Manrope, Assistant, sans-serif" }}
          >
            {fmtILS(endNetWorth)}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.85)" }}>
            צפי לסוף האופק
          </div>
        </div>
      </section>

      {/* Net worth sparkline */}
      <section className="card-pad mb-6">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          צפי הון נטו לאורך השנים
        </div>
        <div
          className="grid items-end gap-1 overflow-x-auto"
          style={{
            gridTemplateColumns: `repeat(${netWorthSeries.length}, minmax(14px, 1fr))`,
            minHeight: 100,
          }}
        >
          {netWorthSeries.map((p, idx) => {
            const heightPct = (p.netWorth / nwMax) * 100;
            const isRetirement = retirementYear !== null && p.year === retirementYear;
            return (
              <div
                key={p.year}
                className="flex flex-col items-center justify-end"
                style={{ height: 90 }}
                title={`${p.year}: ${fmtILS(p.netWorth)}`}
              >
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(heightPct, 2)}%`,
                    background: isRetirement ? "#B45309" : "#1B4332",
                    opacity: 0.6 + (idx / netWorthSeries.length) * 0.4,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div
          className="mt-1 grid gap-1 text-center text-[9px] text-verdant-muted"
          style={{ gridTemplateColumns: `repeat(${netWorthSeries.length}, minmax(14px, 1fr))` }}
        >
          {netWorthSeries.map((p) => (
            <div
              key={`l${p.year}`}
              style={{
                color: p.year === retirementYear ? "#B45309" : undefined,
                fontWeight: p.year === retirementYear ? 700 : undefined,
              }}
            >
              {p.year % 2 === 0 ? p.year : ""}
            </div>
          ))}
        </div>
      </section>

      {/* Events timeline */}
      <section className="card-pad">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          אירועים בדרך
        </div>
        {events.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-verdant-muted">
            עוד אין אירועים מוגדרים. הזן ילדים בשאלון או צור יעדים ב-/goals.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((e, i) => {
              const color = CATEGORY_COLOR[e.category];
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: "#F9FAF2" }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: color + "20", color }}
                  >
                    <span className="material-symbols-outlined text-[20px]">{e.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-extrabold text-verdant-ink">{e.label}</span>
                      <span className="text-[11px] font-bold" style={{ color }}>
                        {e.year}
                      </span>
                    </div>
                    {e.detail && (
                      <div className="mt-0.5 text-[11px] text-verdant-muted">{e.detail}</div>
                    )}
                  </div>
                  {typeof e.amount === "number" && e.amount !== 0 && (
                    <div className="text-left">
                      <div
                        className="text-[13px] font-extrabold tabular-nums"
                        style={{ color: e.amount < 0 ? "#1B4332" : "#8B2E2E" }}
                      >
                        {e.amount < 0 ? "+" : "−"}
                        {fmtILS(Math.abs(e.amount))}
                      </div>
                      <div className="text-[10px] text-verdant-muted">
                        {e.amount < 0 ? "מתפנה" : "עלות"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-4 px-1 text-[11px] text-verdant-muted">
        מבוסס על שאלון הילדים, יעדים פעילים, מסלול המשכנתא, וגיל פרישה. כל שינוי באלה יעדכן את
        המסלול.
      </div>
    </div>
  );
}
