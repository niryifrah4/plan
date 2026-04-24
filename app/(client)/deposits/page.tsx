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
  summaryForMonth,
  unconfirmEntry,
  updatePlan,
  type DepositEntry,
  type DepositPlan,
  type DepositTargetKind,
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

const KIND_META: Record<DepositTargetKind, { label: string; icon: string; color: string }> = {
  pension:    { label: "פנסיה",      icon: "elderly",              color: "#1B4332" },
  hishtalmut: { label: "השתלמות",    icon: "school",               color: "#2B694D" },
  gemel:      { label: "גמל",        icon: "savings",              color: "#0a7a4a" },
  securities: { label: "השקעות",     icon: "candlestick_chart",    color: "#B45309" },
  savings:    { label: "חיסכון",     icon: "account_balance",      color: "#0284c7" },
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
      setSummary(summaryForMonth(month));
      setPlans(loadPlans());
      setPensionFunds(loadPensionFunds());
      setHistory(loadEntries().filter(e => e.month !== month).sort((a, b) => b.month.localeCompare(a.month)));
    };
    reload();
    window.addEventListener(DEPOSITS_EVENT, reload);
    window.addEventListener("verdant:pension:updated", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(DEPOSITS_EVENT, reload);
      window.removeEventListener("verdant:pension:updated", reload);
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
      const f = pensionFunds.find(x => x.id === newRefId);
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
      // Update planned amount on the entry even before confirming
      const entries = loadEntries();
      const idx = entries.findIndex(e => e.id === entry.id);
      if (idx >= 0) {
        entries[idx] = { ...entries[idx], amount, updatedAt: new Date().toISOString() };
        localStorage.setItem(
          `verdant:c:${(localStorage.getItem("verdant:current_hh") || "")}:deposits:log`,
          JSON.stringify(entries),
        );
        // Re-read via the store's public API to keep events firing
        window.dispatchEvent(new Event(DEPOSITS_EVENT));
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
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="caption">{heLabelForMonth(month)}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="kpi-value">{fmtILS(summary.confirmedTotal)}</span>
              <span className="text-[12px] font-bold" style={{ color: "#5a7a6a" }}>
                מתוך {fmtILS(summary.total)}
              </span>
            </div>
            <div className="text-[11px] font-bold mt-1" style={{ color: "#5a7a6a" }}>
              אושרו {summary.confirmedCount} מתוך {summary.plannedCount} הפקדות
            </div>
          </div>
          <button
            onClick={() => {
              summary.entries.filter(e => !e.confirmed).forEach(e => confirmEntry(e.id));
            }}
            disabled={summary.confirmedCount === summary.plannedCount}
            className="px-4 py-2 rounded-lg text-[12px] font-extrabold transition-all disabled:opacity-40"
            style={{ background: "#1B4332", color: "#fff" }}
          >
            <span className="material-symbols-outlined text-[14px] align-middle ml-1">done_all</span>
            אשר את כולן
          </button>
        </div>

        <div className="w-full h-2 rounded-full mb-5" style={{ background: "#eef2e8" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${summary.plannedCount > 0 ? (summary.confirmedCount / summary.plannedCount) * 100 : 0}%`,
              background: "linear-gradient(90deg, #1B4332, #2B694D)",
            }}
          />
        </div>

        {/* Entries list */}
        {summary.entries.length === 0 ? (
          <div className="text-center py-6 text-[13px] font-bold" style={{ color: "#5a7a6a" }}>
            עוד לא הוגדרו הפקדות — הוסף תוכנית ראשונה למטה
          </div>
        ) : (
          <div className="space-y-2">
            {summary.entries.map(entry => {
              const meta = KIND_META[entry.target.kind];
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all"
                  style={{
                    background: entry.confirmed ? "#f3f8ef" : "#fff",
                    border: `1px solid ${entry.confirmed ? "#C1ECD4" : "#eef2e8"}`,
                  }}
                >
                  <button
                    onClick={() => entry.confirmed ? unconfirmEntry(entry.id) : confirmEntry(entry.id)}
                    className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all"
                    style={{
                      background: entry.confirmed ? "#1B4332" : "transparent",
                      border: entry.confirmed ? "1px solid #1B4332" : "1px solid #d8e0d0",
                    }}
                  >
                    {entry.confirmed && (
                      <span className="material-symbols-outlined text-[15px] text-white font-bold">check</span>
                    )}
                  </button>

                  <div
                    className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: `${meta.color}15`, color: meta.color }}
                  >
                    <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-extrabold truncate" style={{ color: "#012d1d" }}>
                      {entry.target.label}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>{meta.label}</div>
                  </div>

                  <input
                    type="number"
                    value={entry.amount || ""}
                    onChange={e => handleEntryAmountChange(entry, e.target.value)}
                    className="w-28 text-left px-2 py-1.5 rounded-lg text-[13px] font-extrabold tabular"
                    style={{
                      background: entry.confirmed ? "transparent" : "#f8faf6",
                      border: `1px solid ${entry.confirmed ? "transparent" : "#eef2e8"}`,
                      color: entry.confirmed ? "#1B4332" : "#012d1d",
                    }}
                    placeholder="0"
                  />
                  <span className="text-[12px] font-bold" style={{ color: "#5a7a6a" }}>₪</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Plan management ─── */}
      <section className="card-pad mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="caption">תוכנית הפקדות חודשית</div>
            <h3 className="text-lg font-extrabold mt-0.5" style={{ color: "#012d1d" }}>
              מה אמור להיכנס כל חודש
            </h3>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-2 rounded-lg text-[12px] font-extrabold transition-all"
            style={{ background: showAdd ? "#eef2e8" : "#1B4332", color: showAdd ? "#012d1d" : "#fff" }}
          >
            <span className="material-symbols-outlined text-[14px] align-middle ml-1">
              {showAdd ? "close" : "add"}
            </span>
            {showAdd ? "בטל" : "הוסף הפקדה"}
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 rounded-xl" style={{ background: "#f8faf6", border: "1px dashed #d8e0d0" }}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: "#5a7a6a" }}>סוג</label>
                <select
                  value={newKind}
                  onChange={e => { setNewKind(e.target.value as DepositTargetKind); setNewRefId(""); }}
                  className="w-full px-3 py-2 rounded-lg text-[13px] font-bold"
                  style={{ border: "1px solid #eef2e8", background: "#fff" }}
                >
                  <option value="pension">פנסיה</option>
                  <option value="hishtalmut">השתלמות</option>
                  <option value="gemel">גמל</option>
                  <option value="securities">תיק השקעות</option>
                  <option value="savings">חיסכון / חירום</option>
                </select>
              </div>

              {(newKind === "pension" || newKind === "hishtalmut" || newKind === "gemel") && pensionFunds.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold mb-1 block" style={{ color: "#5a7a6a" }}>קופה</label>
                  <select
                    value={newRefId}
                    onChange={e => setNewRefId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-[13px] font-bold"
                    style={{ border: "1px solid #eef2e8", background: "#fff" }}
                  >
                    <option value="">— בחר קופה —</option>
                    {pensionFunds.map(f => (
                      <option key={f.id} value={f.id}>{f.company} · {f.track}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={(newKind === "pension" || newKind === "hishtalmut" || newKind === "gemel") && pensionFunds.length > 0 ? "col-span-2" : ""}>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: "#5a7a6a" }}>שם תצוגה</label>
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="למשל: פנסיה מנורה / תיק השקעות"
                  className="w-full px-3 py-2 rounded-lg text-[13px] font-bold"
                  style={{ border: "1px solid #eef2e8", background: "#fff" }}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: "#5a7a6a" }}>סכום חודשי (₪)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  placeholder="2100"
                  className="w-full px-3 py-2 rounded-lg text-[13px] font-extrabold tabular"
                  style={{ border: "1px solid #eef2e8", background: "#fff" }}
                />
              </div>
            </div>
            <button
              onClick={handleAddPlan}
              className="px-4 py-2 rounded-lg text-[12px] font-extrabold"
              style={{ background: "#1B4332", color: "#fff" }}
            >
              שמור תוכנית
            </button>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="text-center py-6 text-[13px] font-bold" style={{ color: "#5a7a6a" }}>
            עוד לא הוגדרו תוכניות הפקדה
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map(plan => {
              const meta = KIND_META[plan.target.kind];
              return (
                <div
                  key={plan.id}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
                  style={{ border: "1px solid #eef2e8" }}
                >
                  <div
                    className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: `${meta.color}15`, color: meta.color }}
                  >
                    <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-extrabold truncate" style={{ color: "#012d1d" }}>
                      {plan.target.label}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
                      {meta.label} · {plan.active ? "פעיל" : "מושהה"}
                    </div>
                  </div>

                  <input
                    type="number"
                    defaultValue={plan.monthlyAmount}
                    onBlur={e => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v !== plan.monthlyAmount) {
                        updatePlan(plan.id, { monthlyAmount: v });
                      }
                    }}
                    className="w-28 text-left px-2 py-1.5 rounded-lg text-[13px] font-extrabold tabular"
                    style={{ background: "#f8faf6", border: "1px solid #eef2e8" }}
                  />
                  <span className="text-[12px] font-bold" style={{ color: "#5a7a6a" }}>₪</span>

                  <button
                    onClick={() => updatePlan(plan.id, { active: !plan.active })}
                    className="p-1.5 rounded-lg"
                    style={{ color: plan.active ? "#1B4332" : "#8aab99" }}
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
                    className="p-1.5 rounded-lg"
                    style={{ color: "#b91c1c" }}
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
          <h3 className="text-lg font-extrabold mb-4" style={{ color: "#012d1d" }}>חודשים קודמים</h3>

          <div className="space-y-4">
            {Object.entries(historyByMonth).map(([m, entries]) => {
              const confirmed = entries.filter(e => e.confirmed);
              const total = confirmed.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={m} className="pb-3 border-b" style={{ borderColor: "#eef2e8" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-extrabold" style={{ color: "#012d1d" }}>
                      {heLabelForMonth(m)}
                    </span>
                    <span className="text-[13px] font-extrabold tabular" style={{ color: "#1B4332" }}>
                      {fmtILS(total)}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
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
