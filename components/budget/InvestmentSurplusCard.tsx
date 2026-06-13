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

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";
import { buildForecast, type ForecastMonth } from "@/lib/cashflow-forecast";
import { buildBudgetLines, totalBudget } from "@/lib/budget-store";
import { getMonthlyNetIncome } from "@/lib/income";
import { loadBuckets, saveBuckets, createBucket, pickColor } from "@/lib/buckets-store";
import { AddGoalModal } from "@/app/(client)/goals/page-files/AddGoalModal";

function getIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("רכב") || n.includes("מכונית")) return "directions_car";
  if (n.includes("דירה") || n.includes("בית") || n.includes("משכנתא")) return "home";
  if (n.includes("חופשה") || n.includes("טיול") || n.includes("טיסה")) return "flight";
  if (n.includes("לימוד") || n.includes("השכלה") || n.includes("קורס")) return "school";
  if (n.includes("חירום") || n.includes("רזרב")) return "shield";
  if (n.includes("פנסי") || n.includes("גמלא")) return "elderly";
  if (n.includes("ילד") || n.includes("תינוק")) return "child_care";
  if (n.includes("חתונה") || n.includes("אירוע")) return "celebration";
  return "savings";
}

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
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const handleAddGoal = useCallback((input: Parameters<typeof createBucket>[0]) => {
    const bucket = createBucket({
      ...input,
      icon: getIcon(input.name),
      color: input.color || pickColor(input.name + Date.now()),
    });
    if (input.scope) bucket.scope = input.scope;
    const buckets = loadBuckets();
    saveBuckets([...buckets, bucket]);
    window.dispatchEvent(new Event("verdant:buckets:updated"));
    setShowAddGoal(false);
    setAddedToast(`"${input.name}" נוסף ליעדים`);
    setTimeout(() => setAddedToast(null), 3000);
  }, []);

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
        background: positive ? "#FAFAF7" : "rgba(217,119,6,0.08)",
        border: `1px solid ${positive ? "#E5E7EB" : "rgba(217,119,6,0.30)"}`,
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div
            className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: positive ? "#2C7A5A" : "#92400E" }}
          >
            תזרים פנוי להשקעות
          </div>
          <h3
            className="text-base font-extrabold"
            style={{ color: positive ? "#FFFFFF" : "#78350F" }}
          >
            {positive
              ? "כמה אני יכול לקחת להשקעות"
              : "אין עודף החודש — לפני השקעה, צריך לסגור פערים"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddGoal(true)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 shadow-sm"
            style={{
              background: positive ? "rgba(44,122,90,0.12)" : "rgba(146,64,14,0.12)",
              color: positive ? "#2C7A5A" : "#92400E",
              border: `1px solid ${positive ? "rgba(44,122,90,0.25)" : "rgba(146,64,14,0.25)"}`,
            }}
            title="הוסף יעד חדש"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
          </button>
          <Link
            href="/goals"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 shadow-sm"
            style={{
              background: positive ? "#2C7A5A" : "#92400E",
              color: "#FFFFFF",
            }}
          >
            יעדים
            <span className="material-symbols-outlined text-[14px] mr-0.5">arrow_back</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* This month */}
        <div>
          <div className="mb-1 text-[11px] font-bold text-verdant-muted">החודש</div>
          <div
            className="text-[22px] font-extrabold tabular-nums leading-tight"
            style={{ color: positive ? "#2C7A5A" : "#B91C1C" }}
          >
            {fmtILS(summary.currentSurplus, { signed: true })}
          </div>
          <div className="mt-0.5 text-[11px] text-verdant-muted">
            הכנסות {fmtILS(income)} − הוצאות {fmtILS(expenses)}
          </div>
        </div>

        {/* 12-month annualized average */}
        {forecast.length > 0 && (
          <div
            className="border-r pr-4"
            style={{ borderColor: positive ? "#E5E7EB" : "rgba(217,119,6,0.30)" }}
          >
            <div className="mb-1 text-[11px] font-bold text-verdant-muted">
              ממוצע 12 חודשים קדימה
            </div>
            <div
              className="text-[22px] font-extrabold tabular-nums leading-tight"
              style={{ color: summary.annualizedSurplus >= 0 ? "#2C7A5A" : "#B91C1C" }}
            >
              {fmtILS(summary.annualizedSurplus, { signed: true })}/ח׳
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
            style={{ borderColor: positive ? "#E5E7EB" : "rgba(217,119,6,0.30)" }}
          >
            <div className="mb-1 text-[11px] font-bold text-verdant-muted">חודש השיא</div>
            <div
              className="text-[22px] font-extrabold tabular-nums leading-tight"
              style={{ color: "#2C7A5A" }}
            >
              {fmtILS(summary.peakSurplus, { signed: true })}
            </div>
            <div className="mt-0.5 text-[11px] text-verdant-muted">{summary.peakLabel}</div>
          </div>
        )}
      </div>

      {summary.annualizedSurplus > 0 && (
        <div
          className="mt-4 rounded-xl px-3 py-2 text-[12px] leading-relaxed"
          style={{
            background: "#FFFFFF",
            border: `1px solid ${positive ? "#E5E7EB" : "rgba(217,119,6,0.30)"}`,
            color: "#1A1A1A",
          }}
        >
          <span className="font-extrabold">
            כ-{fmtILS(summary.annualizedSurplus * 12)} בשנה
          </span>{" "}
          ניתן לכוון להשקעות / קרן השתלמות / קרן חירום / מטרות. כל עסקה שמסתיימת
          מגדילה את הסכום עוד.
        </div>
      )}

      {addedToast && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[12px] font-bold flex items-center gap-2"
          style={{ background: "#2C7A5A", color: "#FFFFFF" }}
        >
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {addedToast}
        </div>
      )}

      <AddGoalModal
        open={showAddGoal}
        onClose={() => setShowAddGoal(false)}
        onSave={handleAddGoal}
      />
    </section>
  );
}
