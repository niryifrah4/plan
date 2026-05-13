"use client";

/**
 * InvestmentSurplusCard — answers Nir's frame-defining question:
 *   "כמה אני יכול לקחת להשקעות?"
 *
 * Pulls from the existing 12-month forecast (which now respects installment
 * + loan endings — see lib/cashflow-forecast.ts). Surfaces three numbers:
 *
 *   1. החודש הזה  — net surplus right now (income − all expenses).
 *   2. תוך 12 חודשים — average projected monthly surplus over the next
 *      12 months. As installments expire it climbs; this is the realistic
 *      "annualized surplus" you can plan an investment cadence around.
 *   3. השיא — best projected monthly surplus inside the window AND the
 *      month it appears, so the family knows when a step-up of contributions
 *      to the brokerage / pension / goals becomes safe.
 *
 * Built 2026-05-13 per Nir's strategic note: the first-client conversation
 * is about cashflow precision + "how much can I take to investments?". A
 * single number in the cashflow card answers half the question; this widget
 * answers the other half — the forward trajectory.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";
import { buildForecast, type ForecastMonth } from "@/lib/cashflow-forecast";
import { buildBudgetLines, totalBudget } from "@/lib/budget-store";
import { getMonthlyNetIncome } from "@/lib/income";

interface Props {
  /** Optional override — pass live totals so the card stays in sync with
   *  the tab it's rendered inside. Falls back to its own derivation. */
  currentIncome?: number;
  currentExpenses?: number;
}

export function InvestmentSurplusCard({ currentIncome, currentExpenses }: Props) {
  const [forecast, setForecast] = useState<ForecastMonth[]>([]);
  const [fallbackIncome, setFallbackIncome] = useState(0);
  const [fallbackExpenses, setFallbackExpenses] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setForecast(buildForecast());
      // Derive own income/expense numbers so the card works standalone too.
      const lines = buildBudgetLines(0);
      const totals = totalBudget(lines);
      setFallbackIncome(getMonthlyNetIncome() || totals.budget);
      setFallbackExpenses(totals.actual || totals.budget);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:budgets:updated", refresh);
    window.addEventListener("verdant:debt:updated", refresh);
    window.addEventListener("verdant:special-events:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:budgets:updated", refresh);
      window.removeEventListener("verdant:debt:updated", refresh);
      window.removeEventListener("verdant:special-events:updated", refresh);
    };
  }, []);

  const income = currentIncome ?? fallbackIncome;
  const expenses = currentExpenses ?? fallbackExpenses;

  const summary = useMemo(() => {
    const currentSurplus = income - expenses;
    if (forecast.length === 0) {
      return { currentSurplus, annualizedSurplus: 0, peakSurplus: 0, peakLabel: "" };
    }
    const annualizedSurplus = Math.round(
      forecast.reduce((s, m) => s + m.netCashflow, 0) / forecast.length
    );
    const peak = forecast.reduce(
      (best, m) => (m.netCashflow > best.netCashflow ? m : best),
      forecast[0]
    );
    return {
      currentSurplus,
      annualizedSurplus,
      peakSurplus: Math.round(peak.netCashflow),
      peakLabel: peak.label,
    };
  }, [forecast, income, expenses]);

  // No data → don't render anything. The empty-state explainer in /budget
  // already nudges the family to fill in the basics.
  if (income <= 0 && expenses <= 0) return null;

  const positive = summary.currentSurplus > 0;
  const stepUp = summary.annualizedSurplus - summary.currentSurplus;

  return (
    <section
      className="mb-6 rounded-2xl p-5"
      style={{
        background: positive ? "#eef7f1" : "#fffbea",
        border: `1px solid ${positive ? "#c9e3d4" : "#fde68a"}`,
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div
            className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: positive ? "#1B4332" : "#92400E" }}
          >
            תזרים פנוי להשקעות
          </div>
          <h3
            className="text-base font-extrabold"
            style={{ color: positive ? "#012D1D" : "#78350F" }}
          >
            {positive
              ? "כמה אני יכול לקחת להשקעות"
              : "אין עודף החודש — לפני השקעה, צריך לסגור פערים"}
          </h3>
        </div>
        <Link
          href="/goals"
          className="text-[11px] font-bold underline-offset-2 hover:underline"
          style={{ color: positive ? "#1B4332" : "#92400E" }}
        >
          לכוון ליעדים →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* This month */}
        <div>
          <div className="mb-1 text-[11px] font-bold text-verdant-muted">החודש</div>
          <div
            className="text-[22px] font-extrabold tabular-nums leading-tight"
            style={{ color: positive ? "#1B4332" : "#991B1B" }}
          >
            {summary.currentSurplus >= 0 ? "+" : ""}
            {fmtILS(summary.currentSurplus)}
          </div>
          <div className="mt-0.5 text-[11px] text-verdant-muted">
            הכנסות {fmtILS(income)} − הוצאות {fmtILS(expenses)}
          </div>
        </div>

        {/* 12-month annualized average */}
        {forecast.length > 0 && (
          <div
            className="border-r pr-4"
            style={{ borderColor: positive ? "#c9e3d4" : "#fde68a" }}
          >
            <div className="mb-1 text-[11px] font-bold text-verdant-muted">
              ממוצע 12 חודשים קדימה
            </div>
            <div
              className="text-[22px] font-extrabold tabular-nums leading-tight"
              style={{ color: summary.annualizedSurplus >= 0 ? "#1B4332" : "#991B1B" }}
            >
              {summary.annualizedSurplus >= 0 ? "+" : ""}
              {fmtILS(summary.annualizedSurplus)}/ח׳
            </div>
            <div className="mt-0.5 text-[11px] text-verdant-muted">
              {stepUp > 0 ? (
                <>צפי גידול של {fmtILS(stepUp)}/ח׳ — עסקאות מסתיימות</>
              ) : stepUp < 0 ? (
                <>צפי שחיקה של {fmtILS(Math.abs(stepUp))}/ח׳</>
              ) : (
                <>צפי דומה למצב הנוכחי</>
              )}
            </div>
          </div>
        )}

        {/* Peak month */}
        {forecast.length > 0 && summary.peakSurplus > summary.currentSurplus && (
          <div
            className="border-r pr-4"
            style={{ borderColor: positive ? "#c9e3d4" : "#fde68a" }}
          >
            <div className="mb-1 text-[11px] font-bold text-verdant-muted">חודש השיא</div>
            <div
              className="text-[22px] font-extrabold tabular-nums leading-tight"
              style={{ color: "#1B4332" }}
            >
              +{fmtILS(summary.peakSurplus)}
            </div>
            <div className="mt-0.5 text-[11px] text-verdant-muted">{summary.peakLabel}</div>
          </div>
        )}
      </div>

      {summary.annualizedSurplus > 0 && (
        <div
          className="mt-4 rounded-xl px-3 py-2 text-[12px] leading-relaxed"
          style={{
            background: "#ffffff",
            border: `1px solid ${positive ? "#c9e3d4" : "#fde68a"}`,
            color: "#012D1D",
          }}
        >
          <span className="font-extrabold">
            כ-{fmtILS(summary.annualizedSurplus * 12)} בשנה
          </span>{" "}
          ניתן לכוון להשקעות / קרן השתלמות / קרן חירום / מטרות. כל עסקה שמסתיימת
          מגדילה את הסכום עוד.
        </div>
      )}
    </section>
  );
}
