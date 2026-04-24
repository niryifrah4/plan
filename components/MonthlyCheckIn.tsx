"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  MonthlyCheckIn — The "honesty" ritual
 * ═══════════════════════════════════════════════════════════
 *
 * Once a month, the client is asked one simple question per bucket:
 *   "Did you actually deposit what you planned?"
 *
 * Options:
 *   • Yes, full amount (planned)
 *   • Partial — custom amount
 *   • No, skipped this month (0)
 *
 * This is Plan's core honesty mechanism. No bank integration ever —
 * the client commits to self-reporting. Results update bucket.currentAmount
 * and append to contributionHistory + balanceSnapshots.
 *
 * Storage of "last check-in month" lives in `verdant:monthly_checkin`.
 */

import { useState, useMemo, useEffect } from "react";
import {
  loadBuckets,
  saveBuckets,
  recordCheckIn,
  type Bucket,
} from "@/lib/buckets-store";
import { fmtILS } from "@/lib/format";
import { scopedKey } from "@/lib/client-scope";

const CHECKIN_KEY = "verdant:monthly_checkin";

/** Returns YYYY-MM for current month */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function hebrewMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  return `${months[Number(m) - 1]} ${y}`;
}

/* ═══════════════════════════════════════════════════════════ */
/* Helpers exported for dashboard / banners                       */
/* ═══════════════════════════════════════════════════════════ */

/** Has the client already done this month's check-in? */
export function hasCheckedInThisMonth(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(scopedKey(CHECKIN_KEY));
    if (!raw) return false;
    const data = JSON.parse(raw) as { lastMonth?: string };
    return data.lastMonth === currentMonth();
  } catch {
    return false;
  }
}

function markCheckedIn() {
  try {
    localStorage.setItem(
      scopedKey(CHECKIN_KEY),
      JSON.stringify({ lastMonth: currentMonth(), at: new Date().toISOString() })
    );
  } catch {}
}

/* ═══════════════════════════════════════════════════════════ */
/* Component                                                      */
/* ═══════════════════════════════════════════════════════════ */

type Choice = "full" | "partial" | "skip";

interface RowState {
  choice: Choice;
  partialAmount: string; // raw input
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone?: (summary: { confirmed: number; skipped: number; totalActual: number }) => void;
}

export function MonthlyCheckIn({ open, onClose, onDone }: Props) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);
  const month = currentMonth();

  useEffect(() => {
    if (!open) return;
    const loaded = loadBuckets();
    setBuckets(loaded);
    // Default: assume full contribution for all active buckets
    const initial: Record<string, RowState> = {};
    loaded.forEach(b => {
      initial[b.id] = { choice: "full", partialAmount: String(b.monthlyContribution || 0) };
    });
    setRows(initial);
  }, [open]);

  const totalPlanned = useMemo(
    () => buckets.reduce((s, b) => s + (b.monthlyContribution || 0), 0),
    [buckets]
  );

  const totalActual = useMemo(() => {
    return buckets.reduce((sum, b) => {
      const row = rows[b.id];
      if (!row) return sum;
      if (row.choice === "full") return sum + (b.monthlyContribution || 0);
      if (row.choice === "skip") return sum;
      const n = parseFloat(row.partialAmount.replace(/[^\d.-]/g, "")) || 0;
      return sum + n;
    }, 0);
  }, [buckets, rows]);

  const deltaFromPlan = totalActual - totalPlanned;

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function handleConfirm() {
    setSaving(true);
    try {
      let updated = [...buckets];
      let confirmedCount = 0;
      let skippedCount = 0;

      for (const b of buckets) {
        const row = rows[b.id];
        if (!row) continue;
        let actual = 0;
        if (row.choice === "full") actual = b.monthlyContribution || 0;
        else if (row.choice === "partial") actual = parseFloat(row.partialAmount.replace(/[^\d.-]/g, "")) || 0;
        else actual = 0;

        if (row.choice === "skip") skippedCount++;
        else confirmedCount++;

        updated = updated.map(x => (x.id === b.id ? recordCheckIn(x, month, actual) : x));
      }

      saveBuckets(updated);
      markCheckedIn();

      onDone?.({
        confirmed: confirmedCount,
        skipped: skippedCount,
        totalActual,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(1,45,29,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-organic shadow-soft max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-7 pb-5 border-b" style={{ borderColor: "#eef2e8" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: "#1B4332" }}>
                Check-in · רגע של כנות
              </div>
              <h2 className="text-2xl font-extrabold text-verdant-ink mt-1">
                איך היה {hebrewMonth(month)}?
              </h2>
              <p className="text-[12px] text-verdant-muted mt-1.5 leading-relaxed max-w-md">
                לפני שאנחנו מסתכלים קדימה — בוא נוודא שהחודש שעבר באמת הלך כמו שתכננת. על כל קופה, סמן אם הפקדת את הסכום המלא, חלקי, או דילגת.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-verdant-muted hover:bg-verdant-bg transition-colors"
              aria-label="סגור"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-5 space-y-3">
          {buckets.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-symbols-outlined text-[32px] text-verdant-muted">palette</span>
              <div className="text-[13px] font-bold text-verdant-ink mt-2">אין קופות לעדכן</div>
              <div className="text-[11px] text-verdant-muted">צור קופה ראשונה בעמוד היעדים</div>
            </div>
          ) : (
            buckets.map(b => {
              const row = rows[b.id] || { choice: "full" as Choice, partialAmount: "0" };
              const planned = b.monthlyContribution || 0;
              return (
                <div
                  key={b.id}
                  className="p-4 rounded-xl"
                  style={{ background: "#fff", border: "1px solid #eef2e8", borderRight: `4px solid ${b.color}` }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${b.color}15` }}
                    >
                      <span className="material-symbols-outlined text-[22px]" style={{ color: b.color }}>
                        {b.icon || "flag"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-extrabold text-verdant-ink">{b.name}</div>
                      <div className="text-[11px] text-verdant-muted font-bold tabular">
                        תכנון: {fmtILS(planned)}/ח׳
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { key: "full" as Choice, label: "הפקדתי הכל", icon: "check_circle", color: "#1B4332" },
                      { key: "partial" as Choice, label: "הפקדתי חלק", icon: "adjust", color: "#f59e0b" },
                      { key: "skip" as Choice, label: "דילגתי", icon: "cancel", color: "#b91c1c" },
                    ].map(opt => {
                      const active = row.choice === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => updateRow(b.id, { choice: opt.key })}
                          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-bold transition-colors"
                          style={{
                            background: active ? `${opt.color}14` : "#f8faf6",
                            color: active ? opt.color : "#6b7a72",
                            border: active ? `1px solid ${opt.color}40` : "1px solid #eef2e8",
                          }}
                        >
                          <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {row.choice === "partial" && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-verdant-muted">סכום שהפקדת:</span>
                      <div className="relative flex-1 max-w-[160px]">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.partialAmount}
                          onChange={e => updateRow(b.id, { partialAmount: e.target.value })}
                          className="w-full px-3 py-2 pr-7 rounded-lg text-[13px] font-bold tabular text-verdant-ink"
                          style={{ background: "#f8faf6", border: "1px solid #eef2e8" }}
                          placeholder="0"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-verdant-muted">₪</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {buckets.length > 0 && (
          <div className="px-8 py-5 border-t flex items-center justify-between gap-4" style={{ borderColor: "#eef2e8", background: "#f8faf6" }}>
            <div>
              <div className="text-[10px] uppercase tracking-wide font-bold text-verdant-muted">סך ההפקדות החודש</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <div className="text-xl font-extrabold text-verdant-ink tabular">{fmtILS(totalActual)}</div>
                <div
                  className="text-[11px] font-bold tabular"
                  style={{ color: deltaFromPlan >= 0 ? "#1B4332" : "#b91c1c" }}
                >
                  {deltaFromPlan >= 0 ? "+" : ""}
                  {fmtILS(deltaFromPlan)} מול תכנון
                </div>
              </div>
            </div>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="btn-botanical flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">check</span>
              {saving ? "שומר..." : "סיים check-in"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
