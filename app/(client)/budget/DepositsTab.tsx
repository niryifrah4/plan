"use client";

/**
 * Budget tab: הפקדות חודשיות.
 *
 * Migrated from the standalone /deposits page on 2026-05-19. The data layer
 * (deposits-store) is unchanged — only the UI lives here now. The standalone
 * /deposits route still exists as a redirect to /budget?tab=deposits.
 *
 * Three zones:
 *   1. Month summary (planned vs confirmed, progress)
 *   2. Current month entries — confirm / edit / skip
 *   3. Plan management — add / edit / delete recurring deposits
 *
 * Past-month history is shown at the bottom (read-only audit view).
 */

import { useEffect, useMemo, useState } from "react";
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
import { useConfirm } from "@/components/ui/ConfirmModal";

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
  pension: { label: "פנסיה", icon: "elderly", color: "#2C7A5A" },
  hishtalmut: { label: "השתלמות", icon: "school", color: "#059669" },
  gemel: { label: "גמל", icon: "savings", color: "#2C7A5A" },
  securities: { label: "השקעות", icon: "candlestick_chart", color: "#B45309" },
  savings: { label: "חיסכון", icon: "account_balance", color: "#0284c7" },
};

export function DepositsTab() {
  const { confirm, modal } = useConfirm();
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
      syncGoalsToDepositPlans(loadBuckets());
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
      confirmEntry(entry.id, amount);
    } else {
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
      {modal}

      {/* ─── Current month summary ─── */}
      <section className="card-pad mb-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="caption">{heLabelForMonth(month)}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="kpi-value">{fmtILS(summary.confirmedTotal)}</span>
              <span className="text-[12px] font-bold" style={{ color: "#6B7280" }}>
                מתוך {fmtILS(summary.total)}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-bold" style={{ color: "#6B7280" }}>
              אושרו {summary.confirmedCount} מתוך {summary.plannedCount} הפקדות
            </div>
          </div>
          <button
            onClick={() => {
              summary.entries.filter((e) => !e.confirmed).forEach((e) => confirmEntry(e.id));
            }}
            disabled={summary.confirmedCount === summary.plannedCount}
            className="rounded-lg px-4 py-2 text-[12px] font-extrabold transition-all disabled:opacity-40"
            style={{ background: "#2C7A5A", color: "#FFFFFF" }}
          >
            <span className="material-symbols-outlined ml-1 align-middle text-[14px]">
              done_all
            </span>
            אשר את כולן
          </button>
        </div>

        <div className="mb-5 h-2 w-full rounded-full" style={{ background: "#E5E7EB" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${summary.plannedCount > 0 ? (summary.confirmedCount / summary.plannedCount) * 100 : 0}%`,
              background: "linear-gradient(90deg, #2C7A5A, #059669)",
            }}
          />
        </div>

        {summary.entries.length === 0 ? (
          <div className="py-6 text-center text-[13px] font-bold" style={{ color: "#6B7280" }}>
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
                    background: entry.confirmed ? "#f3f8ef" : "#FFFFFF",
                    border: `1px solid ${entry.confirmed ? "#2C7A5A" : "#E5E7EB"}`,
                  }}
                >
                  <button
                    onClick={() =>
                      entry.confirmed ? unconfirmEntry(entry.id) : confirmEntry(entry.id)
                    }
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all"
                    style={{
                      background: entry.confirmed ? "#2C7A5A" : "transparent",
                      border: entry.confirmed ? "1px solid #2C7A5A" : "1px solid #E5E7EB",
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
                      style={{ color: "#1A1A1A" }}
                    >
                      {entry.target.label}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: "#6B7280" }}>
                      {meta.label}
                    </div>
                  </div>

                  <input
                    type="number"
                    value={entry.amount || ""}
                    onChange={(e) => handleEntryAmountChange(entry, e.target.value)}
                    className="tabular w-28 rounded-lg px-2 py-1.5 text-left text-[13px] font-extrabold"
                    style={{
                      background: entry.confirmed ? "transparent" : "#FAFAF7",
                      border: `1px solid ${entry.confirmed ? "transparent" : "#E5E7EB"}`,
                      color: entry.confirmed ? "#2C7A5A" : "#1A1A1A",
                    }}
                    placeholder="0"
                  />
                  <span className="text-[12px] font-bold" style={{ color: "#6B7280" }}>
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
            <h3 className="mt-0.5 text-lg font-extrabold" style={{ color: "#1A1A1A" }}>
              מה אמור להיכנס כל חודש
            </h3>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-lg px-3 py-2 text-[12px] font-extrabold transition-all"
            style={{
              background: showAdd ? "#E5E7EB" : "#2C7A5A",
              color: "#FFFFFF",
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
            style={{ background: "#FAFAF7", border: "1px dashed #E5E7EB" }}
          >
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#6B7280" }}>
                  סוג
                </label>
                <select
                  value={newKind}
                  onChange={(e) => {
                    setNewKind(e.target.value as DepositTargetKind);
                    setNewRefId("");
                  }}
                  className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
                  style={{ border: "1px solid #E5E7EB", background: "#FFFFFF" }}
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
                      style={{ color: "#6B7280" }}
                    >
                      קופה
                    </label>
                    <select
                      value={newRefId}
                      onChange={(e) => setNewRefId(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
                      style={{ border: "1px solid #E5E7EB", background: "#FFFFFF" }}
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
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#6B7280" }}>
                  שם תצוגה
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="למשל: פנסיה מנורה / תיק השקעות"
                  className="w-full rounded-lg px-3 py-2 text-[13px] font-bold"
                  style={{ border: "1px solid #E5E7EB", background: "#FFFFFF" }}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold" style={{ color: "#6B7280" }}>
                  סכום חודשי (₪)
                </label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="2100"
                  className="tabular w-full rounded-lg px-3 py-2 text-[13px] font-extrabold"
                  style={{ border: "1px solid #E5E7EB", background: "#FFFFFF" }}
                />
              </div>
            </div>
            <button
              onClick={handleAddPlan}
              className="rounded-lg px-4 py-2 text-[12px] font-extrabold"
              style={{ background: "#2C7A5A", color: "#FFFFFF" }}
            >
              שמור תוכנית
            </button>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="py-6 text-center text-[13px] font-bold" style={{ color: "#6B7280" }}>
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
                  style={{ border: "1px solid #E5E7EB" }}
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
                      style={{ color: "#1A1A1A" }}
                    >
                      {plan.target.label}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: "#6B7280" }}>
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
                    style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
                  />
                  <span className="text-[12px] font-bold" style={{ color: "#6B7280" }}>
                    ₪
                  </span>

                  <button
                    onClick={() => updatePlan(plan.id, { active: !plan.active })}
                    className="rounded-lg p-1.5"
                    style={{ color: plan.active ? "#2C7A5A" : "#6B7280" }}
                    title={plan.active ? "השהה" : "הפעל"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {plan.active ? "pause_circle" : "play_circle"}
                    </span>
                  </button>

                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: `למחוק את "${plan.target.label}"?`,
                        body: "הפקדה חודשית זו תוסר מהתוכנית. פעולה זו בלתי הפיכה.",
                        confirmLabel: "כן, מחק",
                        cancelLabel: "ביטול",
                        variant: "danger",
                      });
                      if (ok) deletePlan(plan.id);
                    }}
                    className="rounded-lg p-1.5"
                    style={{ color: "#DC2626" }}
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
          <h3 className="mb-4 text-lg font-extrabold" style={{ color: "#1A1A1A" }}>
            חודשים קודמים
          </h3>

          <div className="space-y-4">
            {Object.entries(historyByMonth).map(([m, entries]) => {
              const confirmed = entries.filter((e) => e.confirmed);
              const total = confirmed.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={m} className="border-b pb-3" style={{ borderColor: "#E5E7EB" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-extrabold" style={{ color: "#1A1A1A" }}>
                      {heLabelForMonth(m)}
                    </span>
                    <span
                      className="tabular text-[13px] font-extrabold"
                      style={{ color: "#2C7A5A" }}
                    >
                      {fmtILS(total)}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold" style={{ color: "#6B7280" }}>
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
