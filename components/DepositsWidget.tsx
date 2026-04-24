"use client";

/**
 * Dashboard widget — "הפקדות החודש".
 *
 * Shows one row per active DepositPlan with its amount, status (confirmed /
 * open) and a quick toggle. Total at the top shows X/Y confirmed + sum.
 * Clicking the card opens /deposits for full management.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import {
  confirmEntry,
  currentMonthKey,
  DEPOSITS_EVENT,
  summaryForMonth,
  unconfirmEntry,
  type DepositEntry,
  type MonthSummary,
} from "@/lib/deposits-store";

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function heLabelForMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${HE_MONTHS[m - 1]} ${y}`;
}

const KIND_LABEL: Record<string, string> = {
  pension: "פנסיה",
  hishtalmut: "השתלמות",
  gemel: "גמל",
  securities: "השקעות",
  savings: "חיסכון",
};

const KIND_ICON: Record<string, string> = {
  pension: "elderly",
  hishtalmut: "school",
  gemel: "savings",
  securities: "candlestick_chart",
  savings: "account_balance",
};

export function DepositsWidget() {
  const [summary, setSummary] = useState<MonthSummary | null>(null);

  useEffect(() => {
    const month = currentMonthKey();
    const reload = () => setSummary(summaryForMonth(month));
    reload();
    window.addEventListener(DEPOSITS_EVENT, reload);
    window.addEventListener("verdant:pension:updated", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(DEPOSITS_EVENT, reload);
      window.removeEventListener("verdant:pension:updated", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  if (!summary) return null;

  const { entries, confirmedCount, plannedCount, confirmedTotal, total, month } = summary;
  const progressPct = plannedCount > 0 ? (confirmedCount / plannedCount) * 100 : 0;

  const handleToggle = (entry: DepositEntry) => {
    if (entry.confirmed) unconfirmEntry(entry.id);
    else confirmEntry(entry.id);
  };

  // Empty state — no plans defined yet
  if (plannedCount === 0) {
    return (
      <div className="card-pad">
        <div className="flex items-start gap-3 mb-4">
          <div className="icon-sm icon-forest">
            <span className="material-symbols-outlined text-[20px]">savings</span>
          </div>
          <div>
            <div className="caption">הפקדות חודשיות</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: "#012d1d" }}>
              {heLabelForMonth(month)}
            </div>
          </div>
        </div>
        <div className="rounded-xl py-5 px-4 text-center" style={{ background: "#f6faf2", border: "1px dashed #d8e0d0" }}>
          <div className="text-[13px] font-bold mb-1" style={{ color: "#012d1d" }}>
            עוד לא הוגדרו הפקדות חודשיות
          </div>
          <div className="text-[11px] mb-3" style={{ color: "#5a7a6a" }}>
            הגדר פעם אחת — אשר כל חודש בלחיצה
          </div>
          <Link
            href={"/deposits" as any}
            className="inline-flex items-center gap-1.5 text-[12px] font-extrabold"
            style={{ color: "#0a7a4a" }}
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            הגדר תוכנית הפקדות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card-pad">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-start gap-3">
          <div className="icon-sm icon-forest">
            <span className="material-symbols-outlined text-[20px]">savings</span>
          </div>
          <div>
            <div className="caption">הפקדות · {heLabelForMonth(month)}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="kpi-value">{fmtILS(confirmedTotal)}</span>
              <span className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
                / {fmtILS(total)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="text-[11px] font-extrabold tabular"
            style={{ color: confirmedCount === plannedCount ? "#1B4332" : "#f59e0b" }}
          >
            {confirmedCount}/{plannedCount}
          </span>
          <span className="text-[9px] font-bold" style={{ color: "#8aab99" }}>אושרו</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full mb-5" style={{ background: "#eef2e8" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #1B4332, #2B694D)",
          }}
        />
      </div>

      {/* Entries — compact rows */}
      <div className="space-y-1.5">
        {entries.map(e => {
          const kindLabel = KIND_LABEL[e.target.kind] || e.target.kind;
          const kindIcon  = KIND_ICON[e.target.kind]  || "savings";
          return (
            <div
              key={e.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors hover:bg-[var(--mint-50,#f0f7ec)]"
            >
              <button
                onClick={() => handleToggle(e)}
                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                style={{
                  background: e.confirmed ? "#1B4332" : "transparent",
                  border: e.confirmed ? "1px solid #1B4332" : "1px solid #d8e0d0",
                }}
                aria-label={e.confirmed ? "בטל אישור" : "אשר הפקדה"}
              >
                {e.confirmed && (
                  <span className="material-symbols-outlined text-[13px] text-white font-bold">check</span>
                )}
              </button>

              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: e.confirmed ? "#1B4332" : "#8aab99" }}
              >
                {kindIcon}
              </span>

              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] font-bold truncate"
                  style={{
                    color: e.confirmed ? "#012d1d" : "#5a7a6a",
                  }}
                >
                  {e.target.label}
                </div>
                <div className="text-[10px]" style={{ color: "#8aab99" }}>{kindLabel}</div>
              </div>

              <span
                className="text-[12px] font-extrabold tabular"
                style={{ color: e.confirmed ? "#1B4332" : "#5a7a6a" }}
              >
                {fmtILS(e.amount)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <Link
        href={"/deposits" as any}
        className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-extrabold transition-colors"
        style={{ borderColor: "#eef2e8", color: "#0a7a4a" }}
      >
        <span>עדכון חודשי מלא</span>
        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
      </Link>
    </div>
  );
}
