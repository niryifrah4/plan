"use client";

/**
 * Budget vs Actual — Real-Time Budgeting
 *
 * Displays: Budget | Actual | Remaining per category, live from parsed
 * transactions. Shows the Moral Compass: every overage is tied to its
 * impact on the user's nearest life goal (via Impact Engine).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";
import {
  buildBudgetLines,
  totalBudget,
  updateBudgetAmount,
  type BudgetLine,
} from "@/lib/budget-store";
import { computeImpact, loadImpactGoals } from "@/lib/impact-engine";

const STATUS_COLOR = {
  safe: "#1B4332",
  warning: "#b45309",
  over: "#b91c1c",
};

const STATUS_BG = {
  safe: "#f0fdf4",
  warning: "#fffbeb",
  over: "#fef2f2",
};

export function BudgetVsActual() {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    setLines(buildBudgetLines());
    const handler = () => setLines(buildBudgetLines());
    window.addEventListener("verdant:budgets:updated", handler);
    window.addEventListener("verdant:docs:updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("verdant:budgets:updated", handler);
      window.removeEventListener("verdant:docs:updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const totals = totalBudget(lines);
  const totalPct = totals.budget > 0 ? totals.actual / totals.budget : 0;
  const goals = typeof window !== "undefined" ? loadImpactGoals() : [];

  return (
    <div
      className="rounded-2xl p-7"
      style={{
        background: "#fff",
        border: "1px solid #d8e0d0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
      }}
    >
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
            Budget vs Actual · תקציב מול ביצוע
          </div>
          <h3 className="text-lg font-extrabold text-verdant-ink">עמודת הביצוע — החודש הנוכחי</h3>
          <p className="mt-1 text-[11px] font-bold text-verdant-muted">
            כל הוצאה נקלטת אוטומטית · ללא מאמץ ידני
          </p>
        </div>
        <div className="text-left">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
            סה״כ נוצל
          </div>
          <div
            className="tabular text-2xl font-extrabold"
            style={{ color: totalPct >= 1 ? "#b91c1c" : totalPct >= 0.8 ? "#b45309" : "#1B4332" }}
          >
            {fmtILS(totals.actual)}
          </div>
          <div className="text-[11px] font-bold text-verdant-muted">
            מתוך {fmtILS(totals.budget)} · נותר {fmtILS(Math.max(0, totals.remaining))}
          </div>
        </div>
      </div>

      {/* Total progress bar */}
      <div className="mb-7">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: "#eef2e8" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, totalPct * 100)}%`,
              background:
                totalPct >= 1
                  ? "linear-gradient(90deg,#b91c1c,#dc2626)"
                  : totalPct >= 0.8
                    ? "linear-gradient(90deg,#b45309,#f59e0b)"
                    : "linear-gradient(90deg,#1B4332,#2B694D)",
            }}
          />
        </div>
      </div>

      {/* Category lines */}
      <div className="space-y-2.5">
        {lines.map((line) => {
          const color = STATUS_COLOR[line.status];
          const bg = STATUS_BG[line.status];
          const widthPct = Math.min(100, line.pct * 100);
          const isEditing = editingKey === line.key;
          const overage = line.actual - line.budget;
          const impact =
            line.status === "over" && goals.length > 0
              ? computeImpact(overage, line.label, goals)
              : null;

          return (
            <div
              key={line.key}
              className="rounded-xl p-4 transition-all"
              style={{ background: bg, border: `1px solid ${color}20` }}
            >
              <div className="flex items-center gap-4">
                {/* Category dot + label */}
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: line.color }}
                  />
                  <div className="truncate text-[13px] font-extrabold text-verdant-ink">
                    {line.label}
                  </div>
                </div>

                {/* Numbers: Budget · Actual · Remaining */}
                <div className="tabular flex items-center gap-5 text-[11px] font-bold">
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-verdant-muted">
                      תקציב
                    </div>
                    {isEditing ? (
                      <input
                        type="number"
                        defaultValue={line.budget}
                        autoFocus
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0) updateBudgetAmount(line.key, v);
                          setEditingKey(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="w-20 rounded border px-1 text-center text-[11px] font-bold outline-none"
                        style={{ borderColor: color }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingKey(line.key)}
                        className="text-verdant-ink hover:underline"
                      >
                        {fmtILS(line.budget)}
                      </button>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-verdant-muted">
                      בוצע
                    </div>
                    <div style={{ color }}>{fmtILS(line.actual)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-verdant-muted">
                      נותר
                    </div>
                    <div style={{ color: line.remaining >= 0 ? "#1B4332" : "#b91c1c" }}>
                      {line.remaining >= 0
                        ? fmtILS(line.remaining)
                        : `-${fmtILS(Math.abs(line.remaining))}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div
                className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "#ffffff80" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%`, background: color }}
                />
              </div>

              {/* Moral Compass: Impact on life goal */}
              {impact && impact.goal && (
                <Link
                  href={"/goals" as any}
                  className="mt-2.5 flex items-center gap-2 text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ color }}
                >
                  <span className="material-symbols-outlined text-[13px]">{impact.goal.icon}</span>
                  <span>{impact.message}</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Moral compass footer */}
      {goals.length === 0 && (
        <div
          className="mt-5 rounded-xl p-3 text-center text-[11px] font-bold text-verdant-muted"
          style={{ background: "#f9faf2" }}
        >
          הגדר יעדים ב-
          <Link href={"/goals" as any} className="underline" style={{ color: "#1B4332" }}>
            עמוד המטרות
          </Link>{" "}
          כדי לראות איך כל חריגה משפיעה על החלומות שלך
        </div>
      )}
    </div>
  );
}
