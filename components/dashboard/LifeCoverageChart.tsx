"use client";

/**
 * LifeCoverageChart — flagship dashboard visualization.
 * Built 2026-05-03 per Nir per Plangram research.
 *
 * One chart from now → age 90 showing:
 *   • blue bars  = projected net worth each year
 *   • amber dots = goals due that year (with cost label on hover)
 *   • red bars   = years where a goal couldn't be funded
 *   • orange marker = retirement year
 *
 * Above the chart:
 *   • Plan Score 0–100 (big circular gauge)
 *   • "Missing piece" (red ₪) + "Surplus piece" (green ₪) as 2 KPIs
 *
 * Below the chart:
 *   • Score breakdown (4 mini bars: goals / savings / debt / emergency)
 *   • Top 3 years where coverage breaks (red years)
 */

import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import { buildLifeCoverage, type LifeCoverage } from "@/lib/life-coverage";

const C = {
  ink: "#012D1D",
  primary: "#1B4332",
  amber: "#B45309",
  red: "#8B2E2E",
  green: "#1B4332",
  muted: "#6B6F65",
  cream: "#F9FAF2",
  bgGrad: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
};

function scoreColor(score: number): string {
  if (score >= 75) return C.green;
  if (score >= 50) return C.amber;
  return C.red;
}

function scoreLabel(score: number): string {
  if (score >= 85) return "מצוין";
  if (score >= 70) return "טוב";
  if (score >= 50) return "סביר";
  if (score >= 30) return "דורש שיפור";
  return "קריטי";
}

export function LifeCoverageChart() {
  const [data, setData] = useState<LifeCoverage | null>(null);

  useEffect(() => {
    setData(buildLifeCoverage());
    const refresh = () => setData(buildLifeCoverage());
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:assumptions", refresh);
    window.addEventListener("verdant:goals:updated", refresh);
    window.addEventListener("verdant:realestate:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:assumptions", refresh);
      window.removeEventListener("verdant:goals:updated", refresh);
      window.removeEventListener("verdant:realestate:updated", refresh);
    };
  }, []);

  if (!data) {
    return (
      <section className="card-pad mb-6 text-verdant-muted text-[12px]">טוען את גרף החיים…</section>
    );
  }

  const { series, missingPiece, surplusPiece, planScore, scoreBreakdown, retirementYear, startNetWorth, coveredPiece, goalsTotal } = data;
  const maxNW = Math.max(...series.map(p => p.netWorth), 1);
  const sCol = scoreColor(planScore);

  // Top 3 problem years for the call-out below the chart
  const problemYears = series.filter(p => p.gapThisYear).slice(0, 3);

  return (
    <section className="mb-6">
      {/* Header */}
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted mb-1">
          גרף החיים · מבט אחד על כל המסלול
        </div>
        <h2 className="text-2xl font-extrabold text-verdant-ink">
          איפה אתה היום, ואיך זה ייראה עד גיל {series[series.length - 1]?.age || 90}
        </h2>
      </div>

      {/* Top row: Score + 3 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {/* Plan Score — big circular gauge */}
        <div
          className="rounded-2xl p-4 col-span-2 md:col-span-1 flex items-center gap-4"
          style={{ background: C.bgGrad, color: C.cream }}
        >
          <div
            className="relative shrink-0"
            style={{ width: 88, height: 88 }}
          >
            <svg viewBox="0 0 100 100" width={88} height={88} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={50} cy={50} r={42} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={9} />
              <circle
                cx={50} cy={50} r={42}
                fill="none"
                stroke={sCol}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={`${(planScore / 100) * 264} 264`}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center font-extrabold tabular-nums"
              style={{ fontSize: 24, fontFamily: "Manrope, Assistant, sans-serif" }}
            >
              {planScore}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.7)" }}>
              מדד פלאן
            </div>
            <div className="text-[16px] font-extrabold mt-0.5" style={{ color: sCol }}>
              {scoreLabel(planScore)}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
              0–100 · גבוה = טוב יותר
            </div>
          </div>
        </div>

        {/* Missing piece */}
        <KpiCard
          label="חתיכה חסרה"
          value={missingPiece}
          tone={missingPiece > 0 ? "warn" : "ok"}
          hint={missingPiece > 0 ? "ערך נוכחי של יעדים שלא יכוסו" : "כל היעדים מכוסים"}
        />

        {/* Surplus piece */}
        <KpiCard
          label="חתיכה עודפת"
          value={surplusPiece}
          tone={surplusPiece > 0 ? "info" : "ok"}
          hint={surplusPiece > 0 ? "כסף בעו״ש מעבר לקרן חירום" : "אין כסף לא מנוצל"}
        />

        {/* Net worth today */}
        <KpiCard
          label="הון נטו היום"
          value={startNetWorth}
          tone="primary"
          hint={`צפי לגיל ${series[series.length - 1]?.age}: ${fmtILS(series[series.length - 1]?.netWorth || 0)}`}
        />
      </div>

      {/* THE CHART */}
      <div className="card-pad" dir="ltr">
        <div className="flex items-center justify-between mb-3" dir="rtl">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            הון נטו צפוי · אדום = שנים שבהן יעדים לא יכוסו
          </div>
          <div className="flex items-center gap-3 text-[10px] text-verdant-muted">
            <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: C.primary, display: "inline-block" }} />הון נטו</span>
            <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: C.red, display: "inline-block" }} />חוסר</span>
            <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: C.amber, borderRadius: 99, display: "inline-block" }} />יעד</span>
          </div>
        </div>
        <div
          className="grid items-end relative"
          style={{ gridTemplateColumns: `repeat(${series.length}, 1fr)`, gap: 2, minHeight: 180 }}
        >
          {series.map((p) => {
            const heightPct = (p.netWorth / maxNW) * 100;
            const barColor = p.gapThisYear ? C.red : (p.isRetirement ? C.amber : C.primary);
            return (
              <div
                key={p.year}
                className="flex flex-col items-center justify-end relative group"
                style={{ height: 160 }}
                title={`${p.year} (גיל ${p.age}): ${fmtILS(p.netWorth)}${p.goalsCost > 0 ? ` · יעד ${fmtILS(p.goalsCost)}` : ""}${p.gapThisYear ? ` · חוסר ${fmtILS(p.gapAmount)}` : ""}`}
              >
                {/* Goal marker dot */}
                {p.goalsCost > 0 && (
                  <div
                    className="absolute"
                    style={{
                      top: -6,
                      width: 8, height: 8, borderRadius: "50%",
                      background: C.amber,
                      border: "1.5px solid white",
                    }}
                  />
                )}
                <div
                  className="w-full"
                  style={{
                    height: `${Math.max(heightPct, 1)}%`,
                    background: barColor,
                    opacity: 0.55 + (heightPct / 100) * 0.45,
                    borderTopLeftRadius: 2,
                    borderTopRightRadius: 2,
                  }}
                />
              </div>
            );
          })}
        </div>
        {/* Year labels — every 5 years to keep readable */}
        <div
          className="grid text-[9px] text-verdant-muted text-center mt-1"
          style={{ gridTemplateColumns: `repeat(${series.length}, 1fr)`, gap: 2 }}
        >
          {series.map((p) => (
            <div key={`l${p.year}`}
              style={{ color: p.year === retirementYear ? C.amber : undefined, fontWeight: p.year === retirementYear ? 700 : 400 }}
            >
              {p.year % 5 === 0 ? p.age : ""}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-verdant-muted text-center mt-1">גיל</div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
        <ScoreBar label="כיסוי יעדים" value={scoreBreakdown.goalCoverage} max={50} />
        <ScoreBar label="שיעור חיסכון" value={scoreBreakdown.savingsRate} max={20} />
        <ScoreBar label="עומס חוב" value={scoreBreakdown.debtBurden} max={15} />
        <ScoreBar label="קרן חירום" value={scoreBreakdown.emergencyFund} max={15} />
      </div>

      {/* Problem years */}
      {problemYears.length > 0 && (
        <div className="mt-4 p-4 rounded-xl" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: C.red }}>
            שנים בעייתיות במסלול
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {problemYears.map(p => (
              <div key={p.year} className="text-[12px]">
                <div className="font-extrabold text-verdant-ink">
                  {p.year} (גיל {p.age})
                </div>
                <div className="text-verdant-muted">
                  יעד של {fmtILS(p.goalsCost)} · חוסר {fmtILS(p.gapAmount)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-verdant-muted mt-2">
            הקפד על תיעדוף יעדים, הגדל הפקדות, או הזז תאריכים כדי לסגור את הפער.
          </div>
        </div>
      )}

      {goalsTotal === 0 && (
        <div className="mt-4 p-3 rounded-xl text-[12px] text-verdant-muted" style={{ background: "#F9FAF2" }}>
          לא הוגדרו יעדים. הוסף יעדים ב-/goals כדי לראות את כיסוי המסלול.
        </div>
      )}

      <div className="text-[10px] text-verdant-muted mt-3 px-1">
        בהתבסס על הון נטו היום, הכנסות/הוצאות, יעדים פעילים, ושיעורי תשואה מהנחות היסוד. שינוי כל פרמטר יעדכן את הגרף בזמן אמת.
      </div>
    </section>
  );
}

function KpiCard({ label, value, tone, hint }: {
  label: string; value: number; tone: "ok" | "warn" | "info" | "primary"; hint?: string;
}) {
  const palette: Record<typeof tone, { bg: string; text: string; accent: string }> = {
    ok:      { bg: "#F0F7F1", text: "#012D1D", accent: "#1B4332" },
    warn:    { bg: "#FEF2F2", text: "#7F1D1D", accent: "#8B2E2E" },
    info:    { bg: "#FEF7E6", text: "#78350F", accent: "#B45309" },
    primary: { bg: "#FFFFFF", text: "#012D1D", accent: "#1B4332" },
  };
  const c = palette[tone];
  return (
    <div className="rounded-2xl p-4" style={{ background: c.bg, border: tone === "primary" ? "1px solid #eef2e8" : "none" }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: c.accent }}>
        {label}
      </div>
      <div
        className="text-[22px] font-extrabold tabular-nums mt-1"
        style={{ color: c.text, fontFamily: "Manrope, Assistant, sans-serif" }}
      >
        {fmtILS(value)}
      </div>
      {hint && <div className="text-[10px] mt-0.5" style={{ color: c.text, opacity: 0.7 }}>{hint}</div>}
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? C.green : pct >= 40 ? C.amber : C.red;
  return (
    <div className="rounded-xl p-3" style={{ border: "1px solid #eef2e8", background: "white" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-verdant-ink">{label}</span>
        <span className="text-[11px] font-extrabold tabular-nums" style={{ color }}>
          {value}/{max}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full" style={{ background: "#eef2e8" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, 4)}%`, background: color }}
        />
      </div>
    </div>
  );
}
