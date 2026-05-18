"use client";

/**
 * /deposits — monthly contribution tracker.
 *
 * Three zones:
 *   1. Month summary (total planned, confirmed, progress)
 *   2. Current month entries — confirm / edit amount / skip
 *   3. Plan management — add / edit / delete recurring deposits
 *
 * Past-month history is shown at the bottom (read-only audit view).
 */

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtILS } from "@/lib/format";
import { loadPensionFunds, type PensionFund } from "@/lib/pension-store";
import {
  addPlan,
  confirmEntry,
  currentMonthKey,
  DEPOSITS_EVENT,
  deletePlan,
  loadEntries,
  loadPlans,
  saveEntries,
  seedMonth,
  summaryForMonth,
  syncGoalsToDepositPlans,
  unconfirmEntry,
  updatePlan,
  type DepositEntry,
  type DepositPlan,
  type DepositTargetKind,
  type MonthSummary,
} from "@/lib/deposits-store";
import { loadBuckets, BUCKETS_EVENT } from "@/lib/buckets-store";

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

const KIND_META: Record<DepositTargetKind, { label: string; icon: string; color: string }> = {
  pension: { label: "פנסיה", icon: "elderly", color: "#A8E040" },
  hishtalmut: { label: "השתלמות", icon: "school", color: "#4ADE80" },
  gemel: { label: "גמל", icon: "savings", color: "#A8E040" },
  securities: { label: "השקעות", icon: "candlestick_chart", color: "#B45309" },
  savings: { label: "חיסכון", icon: "account_balance", color: "#0284c7" },
};

export default function DepositsPage() {
  const month = currentMonthKey();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [plans, setPlans] = useState<DepositPlan[]>([]);
  const [pensionFunds, setPensionFunds] = useState<PensionFund[]>([]);
  const [history, setHistory] = useState<DepositEntry[]>([]);

  // Add-plan form state
  const [showAdd, setShowAdd] = useState(false);
  const [newKind, setNewKind] = useState<DepositTargetKind>("pension");
  const [newRefId, setNewRefId] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");
  const [newAmount, setNewAmount] = useState<string>("");

  useEffect(() => {
    const reload = () => {
      // Sync goals → deposit plans first so any new bucket with monthly
      // contribution shows up here automatically. Idempotent.
      syncGoalsToDepositPlans(loadBuckets());
      // Make sure the current month has entries seeded for every active plan.
      seedMonth(month);
      setSummary(summaryForMonth(month));
      setPlans(loadPlans());
      setPensionFunds(loadPensionFunds());
      setHistory(
        loadEntries()
          .filter((e) => e.month !== month)
          .sort((a, b) => b.month.localeCompare(a.month))
      );
    };
    reload();
    window.addEventListener(DEPOSITS_EVENT, reload);
    window.addEventListener("verdant:pension:updated", reload);
    window.addEventListener(BUCKETS_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(DEPOSITS_EVENT, reload);
      window.removeEventListener("verdant:pension:updated", reload);
      window.removeEventListener(BUCKETS_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [month]);

  const pensionKindFor = (fund: PensionFund): DepositTargetKind => {
    if (fund.type === "hishtalmut") return "hishtalmut";
    if (fund.type === "gemel") return "gemel";
    return "pension";
  };

  // Auto-fill label when selecting a pension fund
  useEffect(() => {
    if (newKind === "pension" || newKind === "hishtalmut" || newKind === "gemel") {
      const f = pensionFunds.find((x) => x.id === newRefId);
      if (f) {
        setNewLabel(f.company + (f.track ? ` · ${f.track}` : ""));
        // Sync kind with fund type
        const k = pensionKindFor(f);
        if (k !== newKind) setNewKind(k);
      }
    }
  }, [newRefId, pensionFunds, newKind]);

  const historyByMonth = useMemo(() => {
    const map: Record<string, DepositEntry[]> = {};
    for (const e of history) {
      (map[e.month] ||= []).push(e);
    }
    return map;
  }, [history]);

  const handleAddPlan = () => {
    const amount = Number(newAmount);
    if (!newLabel || !Number.isFinite(amount) || amount <= 0) return;
    const refId = newRefId || `custom-${Date.now()}`;
    addPlan({
      target: { kind: newKind, refId, label: newLabel },
      monthlyAmount: amount,
      active: true,
    });
    setShowAdd(false);
    setNewKind("pension");
    setNewRefId("");
    setNewLabel("");
    setNewAmount("");
  };

  const handleEntryAmountChange = (entry: DepositEntry, newVal: string) => {
    const amount = Number(newVal);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (entry.confirmed) {
      // Re-confirm with new amount, triggers delta application
      confirmEntry(entry.id, amount);
    } else {
      // Update planned amount on the entry even before confirming.
      // 2026-04-29: use saveEntries() instead of hand-rolling the storage key.
      const entries = loadEntries();
      const idx = entries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        entries[idx] = { ...entries[idx], amount, updatedAt: new Date().toISOString() };
        saveEntries(entries);
      }
    }
  };

  if (!summary) return null;

  return (
    <div>
      <PageHeader
        subtitle="Monthly Deposits · הפקדות חודשיות"
        title="עדכון הפקדות"
        description="מתעדים פעם בחודש — היתרות והתקציב מתעדכנים אוטומטית."
      />

      {/* ─── Current month summary ─── */}
      <section className="card-pad mb-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="caption">{heLabelForMonth(month)}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="kpi-value">{fmtILS(summary.confirmedTotal)}</span>
              <span className="text-[12px] font-bold" style={{ color: "#94A3B8" }}>
                מתוך {fmtILS(summary.total)}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-bold" style={{ color: "#94A3B8" }}>
              אושרו {summary.confirmedCount} מתוך {summary.plannedCount} הפקדות
            </div>
          </div>
          <button
            onClick={() => {
              summary.entries.filter((e) => !e.confirmed).forEach((e) => confirmEntry(e.id));
            }}
            disabled={summary.confirmedCount === summary.plannedCount}
            className="rounded-lg px-4 py-2 text-[12px] font-extrabold transition-all disabled:opacity-40"
            style={{ background: "#A8E040", color: "#131C2E" }}
          >
            <span className="material-symbols-outlined ml-1 align-middle text-[14px]">
              done_all
            </span>
            אשר את כולן
          </button>
        </div>

        <div className="mb-5 h-2 w-full rounded-full" style={{ background: "#1F2A3F" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${summary.plannedCount > 0 ? (summary.confirmedCount / summary.plannedCount) * 100 : 0}%`,
              background: "linear-gradient(90deg, #A8E040, #4ADE80)",
            }}
          />
        </div>

        {/* Entries list */}
        {summary.entries.length === 0 ? (
          <div className="py-6 text-center text-[13px] font-bold" style={{ color: "#94A3B8" }}>
            עוד לא הוגדרו הפקדות — הוסף תוכנית ראשונה למטה
          </div>
        ) : (
          <div className="space-y-2">
            {summary.entries.map((entry) => {
              const meta = KIND_META[entry.target.kind];
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                  style={{
                    background: entry.confirmed ? "#f3f8ef" : "#131C2E",
                    border: `1px solid ${entry.confirmed ? "#A8E040" : "#1F2A3F"}`,
                  }}
                >
                  <button
                    onClick={() =>
                      entry.confirmed ? unconfirmEntry(entry.id) : confirmEntry(entry.id)
                    }
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all"
                    style={{
                      background: entry.confirmed ? "#A8E040" : "transparent",
                      border: entry.confirmed ? "1px solid #A8E040" : "1px solid #1F2A3F",
                    }}
                  >
                    {entry.confirmed && (
                      <span className="material-symbols-outlined text-[15px] font-bold text-white">
                        check
                      </span>
                    )}
                  </button>

                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${meta.color}15`, color: meta.color }}
                  >
                    <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[14px] font-extrabold"
                      style={{ color: "#F8FAFC" }}
                    >
                      {entry.target.label}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: "#94A3B8" }}>
                      {meta.label}
                    </div>
                  </div>

                  <input
                    type="number"
                    value={entry.amount || ""}
                    onChange={(e) => handleEntryAmountChange(entry, e.target.value)}
                    className="tabular w-28 rounded-lg px-2 py-1.5 text-left text-[13px] font-extrabold"
                    style={{
                      background: entry.confirmed ? "transparent" : "#1A2438",
                      border: `1px solid ${entry.confirmed ? "transparent" : "#1F2A3F"}`,
                      color: entry.confirmed ? "#A8E040" : "#F8FAFC",
                    }}
                    placeholder="0"
                  />
                  <span className="text-[12px] font-bold" style={{ color: "#94A3B8" }}>
                    ₪
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Plan management ─── */}
      <section className="card-pad mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="caption">תוכנית הפקדות חודשית</div>
            <h3 className="mt-0.5 text-lg font-extrabold" style={{ color: "#F8FAFC" }}>
              מה אמור להיכנס כל חודש
            </h3>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-lg px-3 py-2 text-[12px] font-extrabold transition-all"
            style={{
              background: showAdd ? "#1F2A3F" : "#A8E040",
              color: showAdd ? "#F8FAFC" : "#131C2E",
            }}
          >
            <span className="material-symbols-outlined ml-1 align-middle text-[14px]">
              {showAdd ? "close" : "add"}
            </span>
            {showAdd ? "בטל" : "הוסף הפקדה"}
          </button>
        </div>

        {showAdd && (
          <div
            className="mb-4 rounded-xl p-4"
            style={{ background: "#1A2438", border: "1px dashed #1F2A3F" }}
          >
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#94A3B8" }}>
                  סוג
                </label>
                <select
                  value={newKind}
                  onChange={(e) => {
                    setNewKind(e.target.value as DepositTargetKind);
                    setNewRefId("");
                  }}
                  className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
                  style={{ border: "1px solid #1F2A3F", background: "#131C2E" }}
                >
                  <option value="pension">פנסיה</option>
                  <option value="hishtalmut">השתלמות</option>
                  <option value="gemel">גמל</option>
                  <option value="securities">תיק השקעות</option>
                  <option value="savings">חיסכון / חירום</option>
                </select>
              </div>

              {(newKind === "pension" || newKind === "hishtalmut" || newKind === "gemel") &&
                pensionFunds.length > 0 && (
                  <div>
                    <label
                      className="mb-1 block text-[11px] font-bold"
                      style={{ color: "#94A3B8" }}
                    >
                      קופה
                    </label>
                    <select
                      value={newRefId}
                      onChange={(e) => setNewRefId(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
                      style={{ border: "1px solid #1F2A3F", background: "#131C2E" }}
                    >
                      <option value="">— בחר קופה —</option>
                      {pensionFunds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.company} · {f.track}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              <div
                className={
                  (newKind === "pension" || newKind === "hishtalmut" || newKind === "gemel") &&
                  pensionFunds.length > 0
                    ? "col-span-2"
                    : ""
                }
              >
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#94A3B8" }}>
                  שם תצוגה
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="למשל: פנסיה מנורה / תיק השקעות"
                  className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
                  style={{ border: "1px solid #1F2A3F", background: "#131C2E" }}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#94A3B8" }}>
                  סכום חודשי (₪)
                </label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="2100"
                  className="tabular w-full rounded-lg px-3 py-2 text-[13px] font-extrabold"
                  style={{ border: "1px solid #1F2A3F", background: "#131C2E" }}
                />
              </div>
            </div>
            <button
              onClick={handleAddPlan}
              className="rounded-lg px-4 py-2 text-[12px] font-extrabold"
              style={{ background: "#A8E040", color: "#131C2E" }}
            >
              שמור תוכנית
            </button>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="py-6 text-center text-[13px] font-bold" style={{ color: "#94A3B8" }}>
            עוד לא הוגדרו תוכניות הפקדה
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => {
              const meta = KIND_META[plan.target.kind];
              return (
                <div
                  key={plan.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ border: "1px solid #1F2A3F" }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${meta.color}15`, color: meta.color }}
                  >
                    <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[14px] font-extrabold"
                      style={{ color: "#F8FAFC" }}
                    >
                      {plan.target.label}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: "#94A3B8" }}>
                      {meta.label} · {plan.active ? "פעיל" : "מושהה"}
                    </div>
                  </div>

                  <input
                    type="number"
                    defaultValue={plan.monthlyAmount}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v !== plan.monthlyAmount) {
                        updatePlan(plan.id, { monthlyAmount: v });
                      }
                    }}
                    className="tabular w-28 rounded-lg px-2 py-1.5 text-left text-[13px] font-extrabold"
                    style={{ background: "#1A2438", border: "1px solid #1F2A3F" }}
                  />
                  <span className="text-[12px] font-bold" style={{ color: "#94A3B8" }}>
                    ₪
                  </span>

                  <button
                    onClick={() => updatePlan(plan.id, { active: !plan.active })}
                    className="rounded-lg p-1.5"
                    style={{ color: plan.active ? "#A8E040" : "#94A3B8" }}
                    title={plan.active ? "השהה" : "הפעל"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {plan.active ? "pause_circle" : "play_circle"}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`למחוק את "${plan.target.label}"?`)) deletePlan(plan.id);
                    }}
                    className="rounded-lg p-1.5"
                    style={{ color: "#F87171" }}
                    title="מחק"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── History ─── */}
      {Object.keys(historyByMonth).length > 0 && (
        <section className="card-pad">
          <div className="caption mb-1">היסטוריה</div>
          <h3 className="mb-4 text-lg font-extrabold" style={{ color: "#F8FAFC" }}>
            חודשים קודמים
          </h3>

          <div className="space-y-4">
            {Object.entries(historyByMonth).map(([m, entries]) => {
              const confirmed = entries.filter((e) => e.confirmed);
              const total = confirmed.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={m} className="border-b pb-3" style={{ borderColor: "#1F2A3F" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-extrabold" style={{ color: "#F8FAFC" }}>
                      {heLabelForMonth(m)}
                    </span>
                    <span
                      className="tabular text-[13px] font-extrabold"
                      style={{ color: "#A8E040" }}
                    >
                      {fmtILS(total)}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold" style={{ color: "#94A3B8" }}>
                    {confirmed.length}/{entries.length} הפקדות אושרו
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
