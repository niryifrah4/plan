"use client";

/**
 * Retirement Advisor Panel
 * ────────────────────────
 * Runs the heuristic advisor on the current plan and renders structured
 * insights. Each insight that has an `action` shows an "Apply" button that
 * dispatches a custom event the parent page catches to move a slider.
 *
 * Why not call Claude API directly here? Two reasons:
 *   1. Heuristics give instant results with zero cost — demo works offline.
 *   2. The output schema (AdvisorReport) is identical to what a Claude
 *      Server Action will return later, so swapping engines is a one-liner.
 */

import { useMemo } from "react";
import { runAdvisor, type AdvisorInsight } from "@/lib/retirement-advisor";
import type { IncomeStreamResult } from "@/lib/retirement-income";
import type { Assumptions } from "@/lib/assumptions";

const SEV_COLORS: Record<
  AdvisorInsight["severity"],
  { bg: string; border: string; text: string; icon: string }
> = {
  critical: { bg: "#FEE2E2", border: "#8B2E2E", text: "#8B2E2E", icon: "#b91c1c" },
  warning: { bg: "#FEF3C7", border: "#B45309", text: "#92400E", icon: "#d97706" },
  info: { bg: "#F0F9F4", border: "#2B694D", text: "#1B4332", icon: "#2B694D" },
  positive: { bg: "#D6EFDC", border: "#1B4332", text: "#014421", icon: "#1B4332" },
};

export function RetirementAdvisorPanel({
  incomeResult,
  assumptions,
  targetMonthly,
  familyName,
}: {
  incomeResult: IncomeStreamResult;
  assumptions: Assumptions;
  targetMonthly: number;
  familyName: string;
}) {
  const report = useMemo(() => {
    // "Has property" if any point in the trajectory shows positive net rent.
    // Count granularity (1 vs. many) isn't needed by the advisor — just "any / none".
    const hasProperty = incomeResult.points.some((p) => p.realestateNet > 0);
    const hasHishtalmut = incomeResult.points.some((p) => p.hishtalmut > 0);
    const hasPension = incomeResult.points.some((p) => p.pension > 0);
    return runAdvisor(incomeResult, assumptions, {
      propertyCount: hasProperty ? 1 : 0,
      pensionFundCount: hasPension ? 1 : 0,
      hasHishtalmut,
    });
  }, [incomeResult, assumptions]);

  const handleApply = (action: NonNullable<AdvisorInsight["action"]>) => {
    // Parent page listens on window — dispatch an event
    window.dispatchEvent(new CustomEvent("retirement:advisor:apply", { detail: action }));
    // Simple UX: scroll to top so user sees the effect on the chart
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const headerColor =
    report.overallSeverity === "critical"
      ? "#8B2E2E"
      : report.overallSeverity === "concern"
        ? "#B45309"
        : "#1B4332";
  const headerBg =
    report.overallSeverity === "critical"
      ? "#FEE2E2"
      : report.overallSeverity === "concern"
        ? "#FEF3C7"
        : "#D6EFDC";
  const headerIcon =
    report.overallSeverity === "critical"
      ? "error"
      : report.overallSeverity === "concern"
        ? "info"
        : "check_circle";

  return (
    <section className="card-pad-lg mb-8">
      <div
        className="mb-6 flex items-start gap-4 rounded-xl p-4"
        style={{ background: headerBg, border: `1px solid ${headerColor}30` }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: headerColor, color: "#fff" }}
        >
          <span className="material-symbols-outlined">{headerIcon}</span>
        </div>
        <div className="flex-1">
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: headerColor, opacity: 0.7 }}
          >
            AI Advisor · יועץ אוטומטי
          </div>
          <h3 className="text-lg font-extrabold" style={{ color: headerColor }}>
            ניתוח התוכנית של {familyName}
          </h3>
          <p className="mt-2 text-[13px] font-bold" style={{ color: headerColor }}>
            {report.summary}
          </p>
        </div>
      </div>

      {report.insights.length === 0 ? (
        <div className="py-10 text-center text-verdant-muted">
          <span className="material-symbols-outlined mb-2 text-4xl">task_alt</span>
          <div className="t-sm font-bold">הכול תקין — אין תובנות נוספות כרגע</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {report.insights.map((ins, i) => {
            const c = SEV_COLORS[ins.severity];
            return (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl p-4"
                style={{
                  background: "#fff",
                  border: `1px solid ${c.border}30`,
                  borderRight: `3px solid ${c.border}`,
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: c.bg, color: c.icon }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {ins.icon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <div className="text-[13px] font-extrabold" style={{ color: c.text }}>
                      {ins.title}
                    </div>
                    {ins.impactMonthly != null && Math.abs(ins.impactMonthly) > 50 && (
                      <div
                        className="tabular shrink-0 text-[10px] font-extrabold"
                        style={{ color: c.text }}
                      >
                        {ins.impactMonthly > 0 ? "+" : ""}
                        {Math.round(ins.impactMonthly).toLocaleString("he-IL")}₪/ח׳
                      </div>
                    )}
                  </div>
                  <div
                    className="text-[11px] font-bold leading-relaxed"
                    style={{ color: c.text, opacity: 0.85 }}
                  >
                    {ins.detail}
                  </div>
                  {ins.action && (
                    <button
                      onClick={() => handleApply(ins.action!)}
                      className="mt-3 rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition-shadow"
                      style={{ background: c.border, color: "#fff" }}
                    >
                      {ins.action.label} ←
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 text-[10px] font-bold text-verdant-muted">
        * התובנות מבוססות על מנוע הכללים המקומי. שלב הבא: חיבור לסוכן Claude עם streaming ו-tool
        use.
      </div>
    </section>
  );
}
