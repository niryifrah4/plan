"use client";

/**
 * DailyCashflowTab — "בדיקת תזרים בעו"ש לפי יום בחודש".
 *
 * Models the same block from the bottom of each monthly sheet in Nir's
 * Excel template: opening checking-account balance, then each known
 * recurring event (salary on day X, credit-card charge on day Y, fixed
 * bill on day Z) projected day-by-day. The user sees the lowest point
 * of the month and which day it lands on — the answer to "when do we
 * actually run out of room, not just on average?".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import Link from "next/link";
import {
  loadDailyCashflow,
  saveDailyCashflow,
  buildTrajectory,
  buildAutoEvents,
  newEventId,
  DAILY_CASHFLOW_EVENT,
  type DailyCashflow,
  type DailyEvent,
} from "@/lib/daily-cashflow-store";
import { ACCOUNTS_EVENT } from "@/lib/accounts-store";

const HE_DAY_SUFFIX = "ה-";
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

/** Recommended emergency buffer = half of monthly recurring outflows.
 *  Per finance-agent: CFP rule-of-thumb for cashflow safety net. */
function recommendedBuffer(totalRecurringOutflows: number): number {
  return Math.round(totalRecurringOutflows / 2 / 100) * 100;
}

export function DailyCashflowTab() {
  const [data, setData] = useState<DailyCashflow | null>(null);

  useEffect(() => {
    setData(loadDailyCashflow());
    // Refresh on any change that could affect the projection — own store,
    // credit-cards (auto-fed events), and debt-store (installments).
    const refresh = () => setData(loadDailyCashflow());
    window.addEventListener("storage", refresh);
    window.addEventListener(DAILY_CASHFLOW_EVENT, refresh);
    window.addEventListener(ACCOUNTS_EVENT, refresh);
    window.addEventListener("verdant:debt:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(DAILY_CASHFLOW_EVENT, refresh);
      window.removeEventListener(ACCOUNTS_EVENT, refresh);
      window.removeEventListener("verdant:debt:updated", refresh);
    };
  }, []);

  // Auto-derived events (credit cards). Computed fresh on every render — cheap,
  // re-runs when underlying stores change because we listen above.
  const autoEvents = useMemo<DailyEvent[]>(() => buildAutoEvents(), [data]);

  const update = useCallback((patch: Partial<DailyCashflow>) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveDailyCashflow(next);
      return next;
    });
  }, []);

  const addEvent = useCallback(() => {
    setData((prev) => {
      if (!prev) return prev;
      const ev: DailyEvent = {
        id: newEventId(),
        label: "",
        dayOfMonth: 1,
        amount: 0,
      };
      const next = { ...prev, events: [...prev.events, ev] };
      saveDailyCashflow(next);
      return next;
    });
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<DailyEvent>) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        events: prev.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      };
      saveDailyCashflow(next);
      return next;
    });
  }, []);

  const removeEvent = useCallback((id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const target = prev.events.find((e) => e.id === id);
      if (!target) return prev;
      if (!window.confirm(`למחוק את "${target.label || "השורה"}"?`)) return prev;
      const next = { ...prev, events: prev.events.filter((e) => e.id !== id) };
      saveDailyCashflow(next);
      return next;
    });
  }, []);

  const traj = useMemo(() => (data ? buildTrajectory(data) : null), [data]);

  if (!data || !traj) {
    return (
      <div className="card-pad text-center text-[12px] text-verdant-muted">טוען…</div>
    );
  }

  // ─── KPI styling ──────────────────────────────────────────────
  // 3-tier minus visualization per finance-agent:
  //   ✅ positive
  //   ⚠️ in the threshold "danger zone" but above zero
  //   ⚠️ in approved overdraft frame (negative but inside creditLine)
  //   ❌ over the approved frame
  const colorForBalance = (v: number) => {
    if (v < -(data.creditLine || 0)) return "#991B1B"; // over frame
    if (v < 0) return "#B45309"; // in frame minus
    if (v < data.threshold) return "#92400E"; // tight but above zero
    return "#1B4332"; // healthy
  };
  const minBalColor = colorForBalance(traj.minBalance);
  const avgBalColor = colorForBalance(traj.averageBalance);
  const endBalColor = colorForBalance(traj.endingBalance);

  // Manual events tagged for the UI, plus the auto-fed card events,
  // shown together but auto-events are read-only (no inline editing).
  const sortedManual = [...data.events]
    .map((e) => ({ ...e, origin: e.origin || ("manual" as const) }))
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const sortedAuto = [...autoEvents].sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const currentMonthLabel = `${HE_MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const buffer = recommendedBuffer(traj.totalRecurringOutflows);
  const bufferGap = buffer - data.openingBalance;

  return (
    <div className="space-y-6" dir="rtl">
      {/* ═══════ Hero / summary ═══════ */}
      <section
        className="rounded-2xl p-5"
        style={{ background: "#fff", border: "1px solid #e8e9e1" }}
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          תזרים יומי — {currentMonthLabel}
        </div>
        <h3 className="mb-4 text-base font-extrabold text-verdant-ink">
          מה צפוי לקרות בעו״ש לפי יום בחודש
        </h3>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi
            label="נקודה נמוכה ביותר"
            value={fmtILS(traj.minBalance)}
            color={minBalColor}
            hint={`${HE_DAY_SUFFIX}${traj.minDay} לחודש`}
          />
          <Kpi
            label="ממוצע יתרה"
            value={fmtILS(traj.averageBalance)}
            color={avgBalColor}
            hint="לאורך החודש"
          />
          <Kpi
            label="ימים מתחת לסף"
            value={`${traj.daysBelowThreshold}`}
            color={traj.daysBelowThreshold > 0 ? "#B45309" : "#1B4332"}
            hint={
              traj.daysBelowZero > 0
                ? `${traj.daysBelowZero} מתוכם במינוס`
                : `סף: ${fmtILS(data.threshold)}`
            }
          />
          <Kpi
            label="יתרה בסוף החודש"
            value={fmtILS(traj.endingBalance)}
            color={endBalColor}
            hint={
              traj.endingBalance >= data.openingBalance
                ? `+${fmtILS(traj.endingBalance - data.openingBalance)}`
                : `−${fmtILS(data.openingBalance - traj.endingBalance)}`
            }
          />
        </div>

        {/* Buffer recommendation — only when there's actual recurring outflow.
            Per finance-agent: half of monthly recurring outflows is the CFP
            rule-of-thumb. Shows red/amber/green by gap from current balance. */}
        {traj.totalRecurringOutflows > 0 && (
          <div
            className="mt-4 flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 text-[12px]"
            style={{
              background: bufferGap > 0 ? "#fffbea" : "#eef7f1",
              border: `1px solid ${bufferGap > 0 ? "#fde68a" : "#c9e3d4"}`,
              color: bufferGap > 0 ? "#92400e" : "#1B4332",
            }}
          >
            <span className="material-symbols-outlined text-[16px]">
              {bufferGap > 0 ? "savings" : "verified"}
            </span>
            <span className="font-extrabold">buffer מומלץ {fmtILS(buffer)}</span>
            <span className="text-verdant-muted">
              · חצי מההוצאות הקבועות החודשיות ({fmtILS(traj.totalRecurringOutflows)})
            </span>
            {bufferGap > 0 ? (
              <span className="font-bold">
                · חסר עוד {fmtILS(bufferGap)} ביתרת הפתיחה
              </span>
            ) : (
              <span className="font-bold">· היתרה מספיקה</span>
            )}
          </div>
        )}

        {/* Settings strip */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#F4F7ED] px-4 py-3">
          <label className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink">
            יתרה נוכחית
            <input
              type="number"
              value={data.openingBalance}
              onChange={(e) => update({ openingBalance: parseFloat(e.target.value) || 0 })}
              className="w-28 rounded-md border bg-white px-2 py-1 text-center text-[13px] font-extrabold tabular-nums"
              style={{ borderColor: "#d8e0d0" }}
              dir="ltr"
            />
            <span className="text-verdant-muted">₪</span>
          </label>
          <span className="text-verdant-muted">·</span>
          <label className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink">
            סף אזהרה
            <input
              type="number"
              value={data.threshold}
              onChange={(e) => update({ threshold: parseFloat(e.target.value) || 0 })}
              className="w-28 rounded-md border bg-white px-2 py-1 text-center text-[13px] font-extrabold tabular-nums"
              style={{ borderColor: "#d8e0d0" }}
              dir="ltr"
            />
            <span className="text-verdant-muted">₪</span>
          </label>
          <span className="text-verdant-muted">·</span>
          <label
            className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink"
            title="המסגרת שהבנק אישר לך לעו״ש. בלי זה — הכל מתחת ל-0 נראה אותו דבר; עם זה — אפשר להבדיל בין מינוס בתוך המסגרת לבין חריגה ממנה."
          >
            מסגרת מאושרת
            <input
              type="number"
              value={data.creditLine || 0}
              onChange={(e) => update({ creditLine: parseFloat(e.target.value) || 0 })}
              className="w-28 rounded-md border bg-white px-2 py-1 text-center text-[13px] font-extrabold tabular-nums"
              style={{ borderColor: "#d8e0d0" }}
              dir="ltr"
            />
            <span className="text-verdant-muted">₪</span>
          </label>
        </div>

        {/* Educational note — 3 minus levels. Always visible per finance-agent's
            warning that "7 days below threshold" can panic a family carrying a
            routine ₪200 minus. Context matters more than the number. */}
        <details
          className="mt-3 rounded-lg text-[11px]"
          style={{ background: "#F9FAF2", border: "1px solid #e8e9e1" }}
        >
          <summary
            className="cursor-pointer px-3 py-2 font-bold text-verdant-ink"
            style={{ color: "#1B4332" }}
          >
            כמה מסוכן מינוס בעו״ש? — 3 רמות
          </summary>
          <div className="space-y-2 px-3 pb-3 leading-relaxed text-verdant-ink">
            <div>
              <span className="font-extrabold" style={{ color: "#92400E" }}>1. סף נמוך בתוך פלוס:</span>{" "}
              לא חירום. הבנק לא מחייב ריבית. השאלה אם זה דפוס חוזר חודש אחר חודש.
            </div>
            <div>
              <span className="font-extrabold" style={{ color: "#B45309" }}>2. מינוס בתוך המסגרת:</span>{" "}
              הבנק מחייב ריבית בערך 6%–12% שנתי. עצבן אבל לא קריטי לחד-פעמי. אם זה כל חודש — אתם
              ממנים את התזרים שלכם בריבית בנקאית בלי לדעת.
            </div>
            <div>
              <span className="font-extrabold" style={{ color: "#991B1B" }}>3. חריגה מהמסגרת:</span>{" "}
              ריבית חריגה (לפעמים 15%+). הבנק עלול לסרב לתשלומים. חייבים לטפל מיד.
            </div>
          </div>
        </details>

        {/* Chart */}
        <div className="mt-5">
          <TrajectoryChart
            trajectory={traj}
            threshold={data.threshold}
            creditLine={data.creditLine || 0}
          />
        </div>
      </section>

      {/* ═══════ Events table ═══════ */}
      <section
        className="rounded-2xl p-5"
        style={{ background: "#fff", border: "1px solid #e8e9e1" }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
              חיובים והכנסות חוזרים
            </div>
            <h3 className="text-base font-extrabold text-verdant-ink">
              לפי יום בחודש
            </h3>
          </div>
          <button
            onClick={addEvent}
            className="btn-botanical inline-flex items-center gap-2 !px-4 !py-2 text-[12px]"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            הוסף שורה
          </button>
        </div>

        {/* Auto-fed events from credit cards. Read-only — to change them the
            user edits the card itself in /balance → חשבונות. Shown above the
            manual list because they're usually the biggest items in the month. */}
        {sortedAuto.length > 0 && (
          <div
            className="mb-3 overflow-hidden rounded-xl"
            style={{ border: "1px solid #c9e3d4", background: "#eef7f1" }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em]"
              style={{ color: "#1B4332", borderBottom: "1px solid #c9e3d4" }}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">credit_card</span>
                מחויב אוטומטית מכרטיסי אשראי
              </span>
              <Link
                href="/balance?tab=accounts"
                className="text-[10px] font-bold text-verdant-emerald underline-offset-2 hover:underline"
              >
                לעדכון →
              </Link>
            </div>
            {sortedAuto.map((ev) => (
              <div
                key={ev.id}
                className="grid items-center px-3 py-2 text-[13px]"
                style={{
                  gridTemplateColumns: "60px minmax(120px,1fr) 110px",
                  borderTop: "1px solid #c9e3d4",
                  columnGap: "8px",
                  background: "#fff",
                }}
              >
                <div className="text-center font-extrabold tabular-nums text-verdant-ink">
                  {ev.dayOfMonth}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-extrabold text-verdant-ink">{ev.label}</div>
                  {ev.notes && (
                    <div className="truncate text-[11px] text-verdant-muted">{ev.notes}</div>
                  )}
                </div>
                <div
                  className="text-left font-extrabold tabular-nums"
                  style={{ color: ev.amount < 0 ? "#991B1B" : "#1B4332" }}
                  dir="ltr"
                >
                  {ev.amount.toLocaleString("he-IL")}
                </div>
              </div>
            ))}
          </div>
        )}

        {sortedManual.length === 0 && sortedAuto.length === 0 ? (
          <div
            className="rounded-xl px-4 py-8 text-center text-[13px]"
            style={{ background: "#F4F7ED", border: "1px dashed #d8e0d0", color: "#5a7a6a" }}
          >
            <div className="font-bold text-verdant-ink">עוד אין חיובים מוגדרים</div>
            <div className="mt-1 text-[12px] leading-relaxed">
              הוסיפו שורה ידנית, או הזינו כרטיסי אשראי ב-
              <Link
                href="/balance?tab=accounts"
                className="underline hover:text-verdant-emerald"
              >
                חשבונות
              </Link>{" "}
              — והם יוזרמו לכאן אוטומטית.
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #eef2e8" }}>
            <div
              className="grid items-center px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em]"
              style={{
                gridTemplateColumns: "60px minmax(120px,1fr) 110px 60px",
                background: "#F4F7ED",
                color: "#5a7a6a",
                columnGap: "8px",
              }}
            >
              <div className="text-center">יום</div>
              <div>תיאור (ידני)</div>
              <div className="text-left">סכום (₪)</div>
              <div />
            </div>
            {sortedManual.length === 0 ? (
              <div className="px-3 py-3 text-center text-[12px] text-verdant-muted">
                אין שורות ידניות — הוסף משכורת, מזונות, חיובי הוראת קבע וכו׳
              </div>
            ) : (
              sortedManual.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  onUpdate={(patch) => updateEvent(ev.id, patch)}
                  onRemove={() => removeEvent(ev.id)}
                />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Sub-components                                                */
/* ═══════════════════════════════════════════════════════════ */

function Kpi({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold text-verdant-muted">{label}</div>
      <div className="text-[20px] font-extrabold tabular-nums" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] font-semibold text-verdant-muted">{hint}</div>
      )}
    </div>
  );
}

function EventRow({
  event,
  onUpdate,
  onRemove,
}: {
  event: DailyEvent;
  onUpdate: (patch: Partial<DailyEvent>) => void;
  onRemove: () => void;
}) {
  const isIncome = event.amount > 0;
  return (
    <div
      className="grid items-center px-3 py-2 text-[13px]"
      style={{
        gridTemplateColumns: "60px minmax(120px,1fr) 110px 60px",
        borderTop: "1px solid #eef2e8",
        columnGap: "8px",
      }}
    >
      <input
        type="number"
        min={1}
        max={31}
        value={event.dayOfMonth}
        onChange={(e) => onUpdate({ dayOfMonth: parseInt(e.target.value, 10) || 1 })}
        className="rounded-md border bg-white py-1 text-center font-extrabold tabular-nums"
        style={{ borderColor: "#eef2e8" }}
        dir="ltr"
      />
      <input
        type="text"
        value={event.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        placeholder="לדוגמה: ויזה כאל, משכורת בעל…"
        className="rounded-md border bg-white px-2 py-1 font-semibold"
        style={{ borderColor: "#eef2e8" }}
      />
      <input
        type="number"
        value={event.amount}
        onChange={(e) => onUpdate({ amount: parseFloat(e.target.value) || 0 })}
        placeholder="−1500 = חיוב"
        className="rounded-md border bg-white py-1 text-left font-extrabold tabular-nums"
        style={{
          borderColor: "#eef2e8",
          color: isIncome ? "#1B4332" : event.amount < 0 ? "#991B1B" : "#5a7a6a",
        }}
        dir="ltr"
      />
      <button
        onClick={onRemove}
        title="מחק"
        className="mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-red-50"
        style={{ color: "#991B1B" }}
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}

function TrajectoryChart({
  trajectory,
  threshold,
  creditLine,
}: {
  trajectory: ReturnType<typeof buildTrajectory>;
  threshold: number;
  creditLine: number;
}) {
  const { points } = trajectory;
  if (points.length === 0) return null;

  const W = 720;
  const H = 220;
  const PAD = { top: 16, right: 20, bottom: 28, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // y-range MUST include 0, threshold, and frame floor (negative creditLine)
  // so all 3 zones render even when balance never reaches them.
  const frameFloor = -(creditLine || 0);
  const allYs = [...points.map((p) => p.balance), 0, threshold, frameFloor];
  const yMax = Math.max(...allYs);
  const yMin = Math.min(...allYs);
  const ySpan = Math.max(1, yMax - yMin);

  const xOf = (i: number) =>
    PAD.left + (innerW * i) / Math.max(1, points.length - 1);
  const yOf = (v: number) => PAD.top + innerH * (1 - (v - yMin) / ySpan);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(p.balance)}`).join(" ");

  // Y-axis ticks: frame floor, min, 0, threshold, max — de-duplicated + sorted
  const tickSet = new Set([yMin, 0, threshold, yMax]);
  if (creditLine > 0) tickSet.add(frameFloor);
  const ticks = Array.from(tickSet).sort((a, b) => a - b);

  // 3-tier zone painting (per finance-agent — 2026-05-12):
  //   ❌ over frame    — deep red, below frameFloor
  //   ⚠️ in frame minus — amber, between frameFloor and 0
  //   ⚠️ tight         — soft yellow, between 0 and threshold
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* Over-frame zone (below frameFloor) */}
        {creditLine > 0 && frameFloor > yMin && (
          <rect
            x={PAD.left}
            y={yOf(frameFloor)}
            width={innerW}
            height={Math.max(0, PAD.top + innerH - yOf(frameFloor))}
            fill="#FEE2E2"
            opacity={0.7}
          />
        )}
        {/* In-frame-minus zone (between frameFloor and 0) */}
        {creditLine > 0 && yMin < 0 && (
          <rect
            x={PAD.left}
            y={yOf(0)}
            width={innerW}
            height={Math.max(0, yOf(frameFloor) - yOf(0))}
            fill="#FED7AA"
            opacity={0.55}
          />
        )}
        {/* No-creditLine fallback — single danger zone below 0 */}
        {creditLine === 0 && yMin < 0 && (
          <rect
            x={PAD.left}
            y={yOf(0)}
            width={innerW}
            height={Math.max(0, PAD.top + innerH - yOf(0))}
            fill="#FEE2E2"
            opacity={0.5}
          />
        )}
        {/* Warning zone (between 0 and threshold) */}
        {threshold > 0 && (
          <rect
            x={PAD.left}
            y={yOf(threshold)}
            width={innerW}
            height={Math.max(0, yOf(Math.max(0, yMin)) - yOf(threshold))}
            fill="#FEF3C7"
            opacity={0.6}
          />
        )}
        {/* Y-axis ticks + gridlines */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke={t === 0 ? "#94a3b8" : "#eef2e8"}
              strokeWidth={t === 0 ? 1 : 0.5}
              strokeDasharray={t === threshold ? "4 3" : undefined}
            />
            <text
              x={PAD.left - 6}
              y={yOf(t) + 3}
              fontSize="10"
              textAnchor="end"
              fill="#5a7a6a"
              fontWeight="600"
            >
              {Math.round(t / 1000)}K
            </text>
          </g>
        ))}
        {/* Trajectory line */}
        <path d={path} stroke="#1B4332" strokeWidth="2" fill="none" />
        {/* Event dots */}
        {points.map((p, i) =>
          p.events.length > 0 ? (
            <g key={`dot-${i}`}>
              <circle
                cx={xOf(i)}
                cy={yOf(p.balance)}
                r={3.5}
                fill="#1B4332"
                stroke="#fff"
                strokeWidth={1.5}
              />
              <title>
                יום {p.day} · {fmtILS(p.balance)}
                {"\n"}
                {p.events.map((e) => `${e.label || "—"}: ${fmtILS(e.amount)}`).join("\n")}
              </title>
            </g>
          ) : null
        )}
        {/* Min marker */}
        {trajectory.minDay > 0 && (
          <g>
            <circle
              cx={xOf(trajectory.minDay - 1)}
              cy={yOf(trajectory.minBalance)}
              r={5}
              fill="none"
              stroke={trajectory.minBalance < 0 ? "#991B1B" : "#B45309"}
              strokeWidth={2}
            />
          </g>
        )}
        {/* X-axis day labels */}
        {[1, 5, 10, 15, 20, 25, points.length].map((d) => {
          if (d > points.length) return null;
          const i = d - 1;
          return (
            <text
              key={`xl-${d}`}
              x={xOf(i)}
              y={PAD.top + innerH + 18}
              fontSize="10"
              textAnchor="middle"
              fill="#5a7a6a"
              fontWeight="600"
            >
              {d}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
