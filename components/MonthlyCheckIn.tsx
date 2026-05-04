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
import { loadBuckets, saveBuckets, recordCheckIn, type Bucket } from "@/lib/buckets-store";
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
  const months = [
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
    loaded.forEach((b) => {
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
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
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
        else if (row.choice === "partial")
          actual = parseFloat(row.partialAmount.replace(/[^\d.-]/g, "")) || 0;
        else actual = 0;

        if (row.choice === "skip") skippedCount++;
        else confirmedCount++;

        updated = updated.map((x) => (x.id === b.id ? recordCheckIn(x, month, actual) : x));
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
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-organic bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b px-8 pb-5 pt-7" style={{ borderColor: "#eef2e8" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: "#1B4332" }}
              >
                Check-in · רגע של כנות
              </div>
              <h2 className="mt-1 text-2xl font-extrabold text-verdant-ink">
                איך היה {hebrewMonth(month)}?
              </h2>
              <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-verdant-muted">
                לפני שאנחנו מסתכלים קדימה — בוא נוודא שהחודש שעבר באמת הלך כמו שתכננת. על כל קופה,
                סמן אם הפקדת את הסכום המלא, חלקי, או דילגת.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-verdant-muted transition-colors hover:bg-verdant-bg"
              aria-label="סגור"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-8 py-5">
          {buckets.length === 0 ? (
            <div className="py-10 text-center">
              <span className="material-symbols-outlined text-[32px] text-verdant-muted">
                palette
              </span>
              <div className="mt-2 text-[13px] font-bold text-verdant-ink">אין קופות לעדכן</div>
              <div className="text-[11px] text-verdant-muted">צור קופה ראשונה בעמוד היעדים</div>
            </div>
          ) : (
            buckets.map((b) => {
              const row = rows[b.id] || { choice: "full" as Choice, partialAmount: "0" };
              const planned = b.monthlyContribution || 0;
              return (
                <div
                  key={b.id}
                  className="rounded-xl p-4"
                  style={{
                    background: "#fff",
                    border: "1px solid #eef2e8",
                    borderRight: `4px solid ${b.color}`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${b.color}15` }}
                    >
                      <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ color: b.color }}
                      >
                        {b.icon || "flag"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-extrabold text-verdant-ink">{b.name}</div>
                      <div className="tabular text-[11px] font-bold text-verdant-muted">
                        תכנון: {fmtILS(planned)}/ח׳
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      {
                        key: "full" as Choice,
                        label: "הפקדתי הכל",
                        icon: "check_circle",
                        color: "#1B4332",
                      },
                      {
                        key: "partial" as Choice,
                        label: "הפקדתי חלק",
                        icon: "adjust",
                        color: "#f59e0b",
                      },
                      { key: "skip" as Choice, label: "דילגתי", icon: "cancel", color: "#b91c1c" },
                    ].map((opt) => {
                      const active = row.choice === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => updateRow(b.id, { choice: opt.key })}
                          className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors"
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
                      <div className="relative max-w-[160px] flex-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.partialAmount}
                          onChange={(e) => updateRow(b.id, { partialAmount: e.target.value })}
                          className="tabular w-full rounded-lg px-3 py-2 pr-7 text-[13px] font-bold text-verdant-ink"
                          style={{ background: "#f8faf6", border: "1px solid #eef2e8" }}
                          placeholder="0"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-verdant-muted">
                          ₪
                        </span>
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
          <div
            className="flex items-center justify-between gap-4 border-t px-8 py-5"
            style={{ borderColor: "#eef2e8", background: "#f8faf6" }}
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-verdant-muted">
                סך ההפקדות החודש
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <div className="tabular text-xl font-extrabold text-verdant-ink">
                  {fmtILS(totalActual)}
                </div>
                <div
                  className="tabular text-[11px] font-bold"
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
