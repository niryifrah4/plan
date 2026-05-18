"use client";

/**
 * DiscoverTab — שלב "מה קרה ב-3/6/12 חודשים אחרונים", בסגנון Spending
 * Snapshot ש-CFP-יועץ עובד איתו. הצורה: טבלה (לא גרף) כי לקוח חוזר
 * למספר ספציפי שהוא יכול לחלוק עליו, ולא לצורה ויזואלית שקל להחמיץ.
 *
 * הפיצ'רים שזה עוזר להבין:
 *   1. ממוצע הוצאות חודשי × 12 — הסיגנל "בשנה אתה מוציא ₪X" שעוצר זוגות
 *      בשיחה (לפי finance-agent 2026-05-16).
 *   2. Spending Snapshot לפי קטגוריה — חודש מול חודש, ממוצע, delta אחרון.
 *   3. חודשים חריגים (>25% מהממוצע) עם 3 העסקאות שהכי תרמו לחריגה.
 *   4. עסקאות תשלומים מסומנות בכל קטגוריה.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";
import {
  buildDiscoverSummary,
  type DiscoverSummary,
} from "@/lib/discover-aggregator";
import { loadParsedTransactions } from "@/lib/budget-import";
import { detectRecurring, type RecurringGroup } from "@/lib/doc-parser/recurring";
import { scopedKey } from "@/lib/client-scope";

const SUBS_FLAGGED_KEY = "verdant:subs_flagged_for_review";

type WindowSize = 3 | 6 | 12;

export function DiscoverTab() {
  const [windowSize, setWindowSize] = useState<WindowSize>(6);
  const [summary, setSummary] = useState<DiscoverSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<RecurringGroup[]>([]);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const refresh = () => {
      setSummary(buildDiscoverSummary(windowSize));
      // Detect recurring against ALL parsed txs (not just the window) so a
      // monthly subscription that appears in 4 months of history clusters
      // even if the user picked 3-month view.
      const allTxs = loadParsedTransactions();
      const subs = detectRecurring(allTxs).filter((g) => g.frequency === "monthly");
      subs.sort((a, b) => b.amount - a.amount);
      setSubscriptions(subs);
      // Load flagged list from localStorage
      try {
        const raw = localStorage.getItem(scopedKey(SUBS_FLAGGED_KEY));
        if (raw) setFlagged(new Set(JSON.parse(raw)));
      } catch {}
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:parsed_transactions:updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:parsed_transactions:updated", refresh);
    };
  }, [windowSize]);

  const toggleFlag = (key: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(scopedKey(SUBS_FLAGGED_KEY), JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Empty-state guard
  if (!summary) {
    return <div className="card-pad text-center text-[12px] text-verdant-muted">טוען…</div>;
  }
  if (summary.txCount === 0) {
    return (
      <div className="space-y-4" dir="rtl">
        <PeriodSelector value={windowSize} onChange={setWindowSize} />
        <section
          className="rounded-2xl p-6 text-center"
          style={{ background: "#F4F7ED", border: "1px dashed #d8e0d0" }}
        >
          <div className="text-base font-extrabold text-verdant-ink">
            אין עדיין נתוני תנועות לניתוח
          </div>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-verdant-muted">
            כדי לראות תמונת תזרים של החודשים האחרונים, יש להעלות קבצי בנק / אשראי
            במסך{" "}
            <Link href="/files" className="underline hover:text-verdant-emerald">
              קבצים במיפוי
            </Link>
            . אחרי שהקבצים נטענים — הניתוח כאן יתעדכן אוטומטית.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PeriodSelector value={windowSize} onChange={setWindowSize} />

      <KpiStrip summary={summary} />

      {summary.txCount < 30 && (
        <div
          className="rounded-xl px-4 py-2.5 text-[12px]"
          style={{ background: "#fffbea", border: "1px solid #fde68a", color: "#92400E" }}
        >
          <span className="font-extrabold">⚠ דאטה דק:</span> רק {summary.txCount} תנועות
          ב-{summary.monthsCovered} חודשים. הממוצע עלול להיות לא מייצג. שווה להעלות
          קבצים נוספים לפני שיחה עם הלקוח.
        </div>
      )}

      <SpendingSnapshot summary={summary} />

      {subscriptions.length > 0 && (
        <SubscriptionsRadar
          subscriptions={subscriptions}
          flagged={flagged}
          onToggleFlag={toggleFlag}
        />
      )}

      {summary.anomalies.length > 0 && <AnomalySection anomalies={summary.anomalies} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* Sub-components                                                      */
/* ═══════════════════════════════════════════════════════════════════ */

function PeriodSelector({
  value,
  onChange,
}: {
  value: WindowSize;
  onChange: (v: WindowSize) => void;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          ניתוח תזרים — חודשים אחרונים
        </div>
        <h3 className="text-base font-extrabold text-verdant-ink">
          מה קרה ב-{value} החודשים האחרונים
        </h3>
      </div>
      <div
        className="inline-flex rounded-full p-0.5"
        style={{ background: "#F4F7ED", border: "1px solid #d8e0d0" }}
      >
        {([3, 6, 12] as const).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              className="rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors"
              style={{
                background: active ? "#1B4332" : "transparent",
                color: active ? "#fff" : "#5a7a6a",
              }}
            >
              {n} חודשים
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiStrip({ summary }: { summary: DiscoverSummary }) {
  const savingsRatePct = (summary.avgSavingsRate * 100).toFixed(0);
  const savingsLabel =
    summary.avgSavingsRate >= 0.2
      ? "בריא"
      : summary.avgSavingsRate >= 0.1
        ? "סביר"
        : summary.avgSavingsRate >= 0
          ? "נמוך"
          : "שלילי";
  const savingsColor =
    summary.avgSavingsRate >= 0.2
      ? "#1B4332"
      : summary.avgSavingsRate >= 0.1
        ? "#92400E"
        : summary.avgSavingsRate >= 0
          ? "#B45309"
          : "#991B1B";

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="ממוצע הוצאות חודשי"
        value={fmtILS(summary.avgMonthlyExpenses)}
        hint={`לאורך ${summary.monthsCovered} חודשים`}
        color="#012D1D"
      />
      <KpiCard
        label="הצפי השנתי"
        value={fmtILS(summary.annualProjectedExpenses)}
        hint="ממוצע × 12"
        color="#1B4332"
        highlight
      />
      <KpiCard
        label="הכנסות חודשיות בממוצע"
        value={fmtILS(summary.avgMonthlyIncome)}
        hint={summary.avgMonthlyIncome > 0 ? "נטו" : "אין נתון"}
        color="#1B4332"
      />
      <KpiCard
        label="שיעור חיסכון"
        value={`${savingsRatePct}%`}
        hint={savingsLabel}
        color={savingsColor}
      />
    </section>
  );
}

function KpiCard({
  label,
  value,
  hint,
  color,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: highlight ? "#eef7f1" : "#fff",
        border: `1px solid ${highlight ? "#c9e3d4" : "#e8e9e1"}`,
      }}
    >
      <div className="mb-1 text-[11px] font-bold text-verdant-muted">{label}</div>
      <div className="text-[22px] font-extrabold tabular-nums leading-tight" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] font-semibold text-verdant-muted">{hint}</div>
      )}
    </div>
  );
}

function SpendingSnapshot({ summary }: { summary: DiscoverSummary }) {
  const { months, categories } = summary;

  if (categories.length === 0) {
    return (
      <section
        className="rounded-2xl px-4 py-5 text-center text-[12px]"
        style={{ background: "#F4F7ED", border: "1px dashed #d8e0d0", color: "#5a7a6a" }}
      >
        אין הוצאות מסווגות בחלון הזמן הזה.
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl"
      style={{ background: "#fff", border: "1px solid #e8e9e1" }}
    >
      <div className="px-5 pt-5 pb-3">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          Spending Snapshot
        </div>
        <h3 className="text-base font-extrabold text-verdant-ink">לאן הלך הכסף — לפי קטגוריה</h3>
      </div>

      <div className="overflow-x-auto" style={{ borderTop: "1px solid #eef2e8" }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "#F4F7ED", color: "#5a7a6a" }}>
              <th className="px-3 py-2 text-right font-extrabold uppercase tracking-[0.06em]">
                קטגוריה
              </th>
              {months.map((m) => (
                <th
                  key={m.ym}
                  className="px-3 py-2 text-left font-extrabold uppercase tracking-[0.06em] tabular-nums"
                >
                  {m.label.split(" ")[0].slice(0, 3)}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-extrabold uppercase tracking-[0.06em] tabular-nums">
                ממוצע
              </th>
              <th className="px-3 py-2 text-left font-extrabold uppercase tracking-[0.06em]">
                שינוי
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((row) => {
              const isVolatile = row.volatility >= 0.5;
              const deltaColor =
                row.lastDelta > 0
                  ? "#B45309"
                  : row.lastDelta < 0
                    ? "#1B4332"
                    : "#5a7a6a";
              return (
                <tr key={row.key} style={{ borderTop: "1px solid #eef2e8" }}>
                  <td className="px-3 py-2 font-bold text-verdant-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      {row.installmentTxCount > 0 && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                          style={{ background: "#eff6ff", color: "#1d4ed8" }}
                          title={`כולל ${row.installmentTxCount} תשלומים זוהו`}
                        >
                          תשלומים×{row.installmentTxCount}
                        </span>
                      )}
                      {isVolatile && (
                        <span
                          className="text-[12px]"
                          style={{ color: "#B45309" }}
                          title="קטגוריה תנודתית — חודש שיא חורג מ-50% מעל הממוצע"
                        >
                          !
                        </span>
                      )}
                    </span>
                  </td>
                  {months.map((m) => (
                    <td
                      key={m.ym}
                      className="px-3 py-2 text-left tabular-nums"
                      style={{ color: "#012D1D" }}
                    >
                      {fmtILS(row.byMonth[m.ym] || 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-left font-extrabold tabular-nums text-verdant-ink">
                    {fmtILS(row.average)}
                  </td>
                  <td
                    className="px-3 py-2 text-left tabular-nums font-bold"
                    style={{ color: deltaColor }}
                  >
                    {row.lastDelta === 0
                      ? "—"
                      : `${row.lastDelta > 0 ? "+" : ""}${fmtILS(row.lastDelta)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#F4F7ED", borderTop: "2px solid #d8e0d0" }}>
              <td className="px-3 py-2.5 font-extrabold text-verdant-ink">סה״כ הוצאות</td>
              {months.map((m) => (
                <td
                  key={m.ym}
                  className="px-3 py-2.5 text-left font-extrabold tabular-nums text-verdant-ink"
                >
                  {fmtILS(m.expenses)}
                </td>
              ))}
              <td
                className="px-3 py-2.5 text-left font-extrabold tabular-nums"
                style={{ color: "#012D1D" }}
              >
                {fmtILS(summary.avgMonthlyExpenses)}
              </td>
              <td />
            </tr>
            <tr style={{ background: "#eef7f1", borderTop: "1px solid #c9e3d4" }}>
              <td className="px-3 py-2.5 font-bold text-verdant-muted">נטו לחודש</td>
              {months.map((m) => (
                <td
                  key={m.ym}
                  className="px-3 py-2.5 text-left font-extrabold tabular-nums"
                  style={{ color: m.net >= 0 ? "#1B4332" : "#991B1B" }}
                >
                  {m.net >= 0 ? "+" : ""}
                  {fmtILS(m.net)}
                </td>
              ))}
              <td
                className="px-3 py-2.5 text-left font-extrabold tabular-nums"
                style={{ color: summary.avgMonthlyNet >= 0 ? "#1B4332" : "#991B1B" }}
              >
                {summary.avgMonthlyNet >= 0 ? "+" : ""}
                {fmtILS(summary.avgMonthlyNet)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function SubscriptionsRadar({
  subscriptions,
  flagged,
  onToggleFlag,
}: {
  subscriptions: RecurringGroup[];
  flagged: Set<string>;
  onToggleFlag: (key: string) => void;
}) {
  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.amount, 0);
  const flaggedTotal = subscriptions
    .filter((s) => flagged.has(subKey(s)))
    .reduce((s, sub) => s + sub.amount, 0);

  return (
    <section
      className="rounded-2xl"
      style={{ background: "#fff", border: "1px solid #e8e9e1" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
        <div>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
            Subscriptions Radar
          </div>
          <h3 className="text-base font-extrabold text-verdant-ink">
            מנויים שאתה לא יודע שאתה משלם
          </h3>
        </div>
        <div className="text-left">
          <div
            className="text-[18px] font-extrabold tabular-nums leading-tight"
            style={{ color: "#1B4332" }}
          >
            {fmtILS(totalMonthly)}/ח׳
          </div>
          <div className="text-[11px] font-bold text-verdant-muted">
            {subscriptions.length} מנויים · {fmtILS(totalMonthly * 12)} בשנה
          </div>
        </div>
      </div>

      {flagged.size > 0 && (
        <div
          className="mx-5 mb-3 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "#fffbea", border: "1px solid #fde68a", color: "#92400E" }}
        >
          סומנו לדיון: <strong>{flagged.size}</strong> מנויים בעלות{" "}
          <strong className="tabular-nums">{fmtILS(flaggedTotal)}/ח׳</strong>
          {" "}({fmtILS(flaggedTotal * 12)} בשנה אם תבטל)
        </div>
      )}

      <div style={{ borderTop: "1px solid #eef2e8" }}>
        {subscriptions.map((sub) => {
          const key = subKey(sub);
          const isFlagged = flagged.has(key);
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-3 px-5 py-2.5"
              style={{
                borderTop: "1px solid #eef2e8",
                background: isFlagged ? "#fffbea" : "#fff",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold text-verdant-ink text-[13px]">
                  {sub.description}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-verdant-muted">
                  {sub.categoryLabel || sub.category || "אחר"} · {sub.matchCount} חודשים
                  עוקבים · ביום {sub.dayOfMonth} בחודש
                </div>
              </div>
              <div className="text-left">
                <div
                  className="text-[14px] font-extrabold tabular-nums"
                  style={{ color: "#1B4332" }}
                >
                  {fmtILS(sub.amount)}
                </div>
                <div className="text-[10px] font-semibold text-verdant-muted">
                  לחודש
                </div>
              </div>
              <button
                onClick={() => onToggleFlag(key)}
                className="rounded-full px-3 py-1 text-[11px] font-bold transition-colors"
                style={{
                  background: isFlagged ? "#fde68a" : "#F4F7ED",
                  color: isFlagged ? "#78350F" : "#5a7a6a",
                  border: `1px solid ${isFlagged ? "#f59e0b" : "#d8e0d0"}`,
                }}
                title={isFlagged ? "הסר סימון" : "סמן לדיון עם הלקוח"}
              >
                {isFlagged ? "✓ סומן לדיון" : "סמן לדיון"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function subKey(sub: RecurringGroup): string {
  return `${sub.description}|${Math.round(sub.amount)}`;
}

function AnomalySection({
  anomalies,
}: {
  anomalies: DiscoverSummary["anomalies"];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-verdant-emerald">flag</span>
        <h3 className="text-base font-extrabold text-verdant-ink">חודשים חריגים</h3>
        <span className="text-[11px] font-semibold text-verdant-muted">
          (הוצאות מעל 25% מהממוצע)
        </span>
      </div>
      <div className="space-y-2">
        {anomalies.map((a) => (
          <div
            key={a.ym}
            className="rounded-xl p-3"
            style={{ background: "#fffbea", border: "1px solid #fde68a" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-extrabold text-[13px]" style={{ color: "#78350f" }}>
                {a.label}
              </div>
              <div className="text-[12px] font-bold" style={{ color: "#92400E" }}>
                {fmtILS(a.total)} · חריגה של {fmtILS(a.delta)} מעל הממוצע
              </div>
            </div>
            {a.topContributors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px]" style={{ color: "#78350f" }}>
                {a.topContributors.map((t, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">
                      • {t.description}{" "}
                      <span className="opacity-70">({t.categoryLabel})</span>
                    </span>
                    <span className="tabular-nums font-bold">{fmtILS(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
