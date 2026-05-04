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
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
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
        <div className="mb-4 flex items-start gap-3">
          <div className="icon-sm icon-forest">
            <span className="material-symbols-outlined text-[20px]">savings</span>
          </div>
          <div>
            <div className="caption">הפקדות חודשיות</div>
            <div className="mt-0.5 text-sm font-bold" style={{ color: "#012d1d" }}>
              {heLabelForMonth(month)}
            </div>
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-5 text-center"
          style={{ background: "#f6faf2", border: "1px dashed #d8e0d0" }}
        >
          <div className="mb-1 text-[13px] font-bold" style={{ color: "#012d1d" }}>
            עוד לא הוגדרו הפקדות חודשיות
          </div>
          <div className="mb-3 text-[11px]" style={{ color: "#5a7a6a" }}>
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
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="icon-sm icon-forest">
            <span className="material-symbols-outlined text-[20px]">savings</span>
          </div>
          <div>
            <div className="caption">הפקדות · {heLabelForMonth(month)}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="kpi-value">{fmtILS(confirmedTotal)}</span>
              <span className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
                / {fmtILS(total)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="tabular text-[11px] font-extrabold"
            style={{ color: confirmedCount === plannedCount ? "#1B4332" : "#f59e0b" }}
          >
            {confirmedCount}/{plannedCount}
          </span>
          <span className="text-[9px] font-bold" style={{ color: "#8aab99" }}>
            אושרו
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-1.5 w-full rounded-full" style={{ background: "#eef2e8" }}>
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
        {entries.map((e) => {
          const kindLabel = KIND_LABEL[e.target.kind] || e.target.kind;
          const kindIcon = KIND_ICON[e.target.kind] || "savings";
          return (
            <div
              key={e.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--mint-50,#f0f7ec)]"
            >
              <button
                onClick={() => handleToggle(e)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-all"
                style={{
                  background: e.confirmed ? "#1B4332" : "transparent",
                  border: e.confirmed ? "1px solid #1B4332" : "1px solid #d8e0d0",
                }}
                aria-label={e.confirmed ? "בטל אישור" : "אשר הפקדה"}
              >
                {e.confirmed && (
                  <span className="material-symbols-outlined text-[13px] font-bold text-white">
                    check
                  </span>
                )}
              </button>

              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: e.confirmed ? "#1B4332" : "#8aab99" }}
              >
                {kindIcon}
              </span>

              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[12px] font-bold"
                  style={{
                    color: e.confirmed ? "#012d1d" : "#5a7a6a",
                  }}
                >
                  {e.target.label}
                </div>
                <div className="text-[10px]" style={{ color: "#8aab99" }}>
                  {kindLabel}
                </div>
              </div>

              <span
                className="tabular text-[12px] font-extrabold"
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
        className="mt-4 flex items-center justify-between border-t pt-3 text-[11px] font-extrabold transition-colors"
        style={{ borderColor: "#eef2e8", color: "#0a7a4a" }}
      >
        <span>עדכון חודשי מלא</span>
        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
      </Link>
    </div>
  );
}
