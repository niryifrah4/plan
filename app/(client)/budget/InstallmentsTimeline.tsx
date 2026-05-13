"use client";

/**
 * InstallmentsTimeline — read-only mirror of /debt installment progress,
 * shown inside the /budget snapshot tab.
 *
 * Stage 2 of Nir's "Excel-like cashflow management" brief (2026-05-12).
 * /debt already lets the user edit each installment row (merchant,
 * payment X of Y, monthly amount). The data is correct; the gap was
 * that it lived only on /debt, so when a couple comes to /budget to
 * plan cashflow they don't see at-a-glance how many installments are
 * active, how much each one demands per month, and crucially — how
 * much money is still committed before the obligation is cleared.
 *
 * Each card section shows:
 *   - merchant + "תשלום X מתוך Y"
 *   - monthly amount
 *   - "נותר לשלם" = monthlyAmount × remainingPayments (incl. this month)
 * Group totals roll up by card; a header KPI rolls up across all groups.
 * Read-only — the user edits in /debt (link provided).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";
import { loadDebtData, type Installment } from "@/lib/debt-store";

const DEBT_EVENT = "verdant:debt:updated";

export function InstallmentsTimeline() {
  const [installments, setInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    const refresh = () => {
      const d = loadDebtData();
      const active = (d.installments || []).filter(
        (i) => i.currentPayment <= i.totalPayments
      );
      setInstallments(active);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(DEBT_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(DEBT_EVENT, refresh);
    };
  }, []);

  if (installments.length === 0) return null;

  // Group by source (credit card / bank). Empty source bucket gets a generic
  // label so it still renders rather than disappearing.
  const grouped = installments.reduce<Record<string, Installment[]>>((acc, inst) => {
    const key = (inst.source || "").trim() || "ללא מקור משויך";
    (acc[key] = acc[key] || []).push(inst);
    return acc;
  }, {});

  // Totals
  const totalMonthly = installments.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
  const totalRemaining = installments.reduce((s, i) => {
    const remaining = Math.max(0, (i.totalPayments || 0) - (i.currentPayment || 0) + 1);
    return s + remaining * (i.monthlyAmount || 0);
  }, 0);

  return (
    <section
      className="mb-6 rounded-2xl p-5"
      style={{ background: "#fff", border: "1px solid #e8e9e1" }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            עסקאות תשלומים פעילות
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">
            {installments.length} עסקאות · {Object.keys(grouped).length} מקורות
          </h3>
        </div>
        <div className="flex items-baseline gap-4">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              חודשי
            </div>
            <div className="text-[16px] font-extrabold tabular-nums text-verdant-ink">
              {fmtILS(totalMonthly)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              סה״כ נותר לשלם
            </div>
            <div className="text-[16px] font-extrabold tabular-nums" style={{ color: "#991B1B" }}>
              {fmtILS(totalRemaining)}
            </div>
          </div>
          <Link
            href="/debt"
            className="text-[11px] font-bold text-verdant-emerald underline-offset-2 hover:underline"
          >
            לעריכה →
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([source, items]) => {
          const groupMonthly = items.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
          const groupRemaining = items.reduce((s, i) => {
            const remaining = Math.max(0, (i.totalPayments || 0) - (i.currentPayment || 0) + 1);
            return s + remaining * (i.monthlyAmount || 0);
          }, 0);
          return (
            <div
              key={source}
              className="overflow-hidden rounded-xl"
              style={{ border: "1px solid #eef2e8" }}
            >
              {/* Source header */}
              <div
                className="flex items-center justify-between px-4 py-2 text-[12px] font-extrabold"
                style={{ background: "#F4F7ED", color: "#012D1D" }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">credit_card</span>
                  {source}
                </span>
                <span className="text-[11px] font-bold text-verdant-muted">
                  {items.length} עסקאות · {fmtILS(groupMonthly)}/ח׳ · {fmtILS(groupRemaining)} נותר
                </span>
              </div>
              {/* Header row */}
              <div
                className="grid items-center px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em]"
                style={{
                  gridTemplateColumns: "minmax(120px,1fr) 90px 90px 110px",
                  color: "#5a7a6a",
                  borderBottom: "1px solid #eef2e8",
                  columnGap: "10px",
                }}
              >
                <div>בית עסק</div>
                <div className="text-left">תשלום</div>
                <div className="text-left">חודשי</div>
                <div className="text-left">נותר לשלם</div>
              </div>
              {/* Rows */}
              {items.map((inst) => {
                const remaining = Math.max(
                  0,
                  (inst.totalPayments || 0) - (inst.currentPayment || 0) + 1
                );
                const remainingMoney = remaining * (inst.monthlyAmount || 0);
                const progressPct =
                  inst.totalPayments > 0
                    ? Math.min(
                        100,
                        Math.max(0, ((inst.currentPayment - 1) / inst.totalPayments) * 100)
                      )
                    : 0;
                return (
                  <div
                    key={inst.id}
                    className="grid items-center px-4 py-2.5 text-[12px]"
                    style={{
                      gridTemplateColumns: "minmax(120px,1fr) 90px 90px 110px",
                      borderBottom: "1px solid #eef2e8",
                      columnGap: "10px",
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-extrabold text-verdant-ink">
                        {inst.merchant || "ללא שם"}
                      </div>
                      {/* Slim progress bar */}
                      <div
                        className="mt-1 h-1 w-full overflow-hidden rounded-full"
                        style={{ background: "#eef2e8" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${progressPct}%`, background: "#1B4332" }}
                        />
                      </div>
                    </div>
                    <div className="text-left font-bold tabular-nums" style={{ color: "#012D1D" }}>
                      {inst.currentPayment}/{inst.totalPayments}
                    </div>
                    <div className="text-left font-bold tabular-nums" style={{ color: "#1B4332" }}>
                      {fmtILS(inst.monthlyAmount || 0)}
                    </div>
                    <div
                      className="text-left font-extrabold tabular-nums"
                      style={{ color: "#991B1B" }}
                    >
                      {fmtILS(remainingMoney)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
