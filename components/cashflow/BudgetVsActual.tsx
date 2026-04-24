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
import { buildBudgetLines, totalBudget, updateBudgetAmount, type BudgetLine } from "@/lib/budget-store";
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
    <div className="rounded-2xl p-7" style={{ background: "#fff", border: "1px solid #d8e0d0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-verdant-muted mb-1">
            Budget vs Actual · תקציב מול ביצוע
          </div>
          <h3 className="text-lg font-extrabold text-verdant-ink">עמודת הביצוע — החודש הנוכחי</h3>
          <p className="text-[11px] text-verdant-muted font-bold mt-1">כל הוצאה נקלטת אוטומטית · ללא מאמץ ידני</p>
        </div>
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-verdant-muted">סה״כ נוצל</div>
          <div className="text-2xl font-extrabold tabular" style={{ color: totalPct >= 1 ? "#b91c1c" : totalPct >= 0.8 ? "#b45309" : "#1B4332" }}>
            {fmtILS(totals.actual)}
          </div>
          <div className="text-[11px] font-bold text-verdant-muted">
            מתוך {fmtILS(totals.budget)} · נותר {fmtILS(Math.max(0, totals.remaining))}
          </div>
        </div>
      </div>

      {/* Total progress bar */}
      <div className="mb-7">
        <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, totalPct * 100)}%`,
              background: totalPct >= 1 ? "linear-gradient(90deg,#b91c1c,#dc2626)"
                : totalPct >= 0.8 ? "linear-gradient(90deg,#b45309,#f59e0b)"
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
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: line.color }} />
                  <div className="text-[13px] font-extrabold text-verdant-ink truncate">{line.label}</div>
                </div>

                {/* Numbers: Budget · Actual · Remaining */}
                <div className="flex items-center gap-5 text-[11px] font-bold tabular">
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-verdant-muted">תקציב</div>
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
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-20 text-[11px] font-bold text-center rounded border outline-none px-1"
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
                    <div className="text-[9px] uppercase tracking-[0.1em] text-verdant-muted">בוצע</div>
                    <div style={{ color }}>{fmtILS(line.actual)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-verdant-muted">נותר</div>
                    <div style={{ color: line.remaining >= 0 ? "#1B4332" : "#b91c1c" }}>
                      {line.remaining >= 0 ? fmtILS(line.remaining) : `-${fmtILS(Math.abs(line.remaining))}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ background: "#ffffff80" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%`, background: color }}
                />
              </div>

              {/* Moral Compass: Impact on life goal */}
              {impact && impact.goal && (
                <Link
                  href={"/goals" as any}
                  className="flex items-center gap-2 mt-2.5 text-[10px] font-bold hover:opacity-80 transition-opacity"
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
        <div className="mt-5 text-[11px] font-bold text-verdant-muted text-center p-3 rounded-xl" style={{ background: "#f9faf2" }}>
          הגדר יעדים ב-<Link href={"/goals" as any} className="underline" style={{ color: "#1B4332" }}>עמוד המטרות</Link> כדי לראות איך כל חריגה משפיעה על החלומות שלך
        </div>
      )}
    </div>
  );
}
