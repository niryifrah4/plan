"use client";

/**
 * Forecast view — "12 חודשים קדימה" — for /m/budget.
 *
 * Top: an income-vs-expense bar chart per month, with the net line
 * overlaid. Below: a flat list of upcoming notable events (loan endings,
 * installment endings, one-off bonuses/expenses) in chronological order.
 *
 * Editing one-off events lives inside this view (simple form) so the
 * forecast value is testable without first building a desktop UI.
 * A richer dashboard editor is the natural Phase D upgrade.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { projectMonths, type ForecastMonth } from "@/lib/forecast-engine";
import {
  ANNUAL_EVENTS_EVENT,
  addAnnualEvent,
  loadAnnualEventsRolling,
  removeAnnualEvent,
  type AnnualEvent,
} from "@/lib/annual-events-store";

export function ForecastView() {
  const [months, setMonths] = useState<ForecastMonth[]>([]);
  const [events, setEvents] = useState<AnnualEvent[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const refresh = () => {
    setMonths(projectMonths(12));
    setEvents(loadAnnualEventsRolling(12));
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    const triggers = [
      ANNUAL_EVENTS_EVENT,
      "verdant:debt:updated",
      "verdant:budgets:updated",
      "verdant:realestate:updated",
      "verdant:salary_profile:updated",
      "storage",
    ];
    triggers.forEach((e) => window.addEventListener(e, onUpdate));
    return () => triggers.forEach((e) => window.removeEventListener(e, onUpdate));
  }, []);

  const summary = useMemo(() => {
    if (months.length === 0) return null;
    const totalIncome = months.reduce((s, m) => s + m.income, 0);
    const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
    const totalNet = totalIncome - totalExpenses;
    return { totalIncome, totalExpenses, totalNet };
  }, [months]);

  const noteRows = useMemo(() => {
    return months.flatMap((m) =>
      m.notes.map((n) => ({ ...n, year: m.year, month: m.month, monthLabel: m.monthLabel }))
    );
  }, [months]);

  return (
    <div dir="rtl">
      {/* Summary header */}
      {summary && (
        <div
          style={{
            background: "var(--morning-surface)",
            border: "1px solid var(--morning-border)",
            borderRadius: 14,
            padding: 14,
            boxShadow: "var(--morning-shadow-card)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--morning-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              נטו ל-12 חודשים
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color:
                  summary.totalNet >= 0
                    ? "var(--morning-forest)"
                    : "var(--morning-coral)",
                fontVariantNumeric: "tabular-nums",
                marginTop: 2,
              }}
            >
              {summary.totalNet >= 0 ? "+" : ""}
              {fmtILS(summary.totalNet)}
            </div>
          </div>
          <div style={{ textAlign: "end", fontSize: 11, color: "var(--morning-muted)" }}>
            <div>נכנס {fmtILS(summary.totalIncome)}</div>
            <div>יוצא {fmtILS(summary.totalExpenses)}</div>
          </div>
        </div>
      )}

      {/* Chart */}
      <ForecastChart months={months} />

      {/* Upcoming events list */}
      <div
        style={{
          marginTop: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>אירועים קרובים</h2>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--morning-forest)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          + הוסף אירוע שנתי
        </button>
      </div>

      {noteRows.length === 0 ? (
        <div
          style={{
            marginTop: 8,
            padding: 16,
            textAlign: "center",
            fontSize: 13,
            color: "var(--morning-muted)",
            background: "var(--morning-surface)",
            border: "1px dashed var(--morning-border-strong)",
            borderRadius: 12,
          }}
        >
          אין אירועים מתוכננים. הוסף משכורת 13, חופשה, ארנונה שנתית או כל סכום
          חד-פעמי שיגיע במהלך השנה כדי שהתחזית תכיל אותם.
        </div>
      ) : (
        <ul
          style={{
            marginTop: 8,
            listStyle: "none",
            padding: 0,
            background: "var(--morning-surface)",
            border: "1px solid var(--morning-border)",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "var(--morning-shadow-card)",
          }}
        >
          {noteRows.map((n, i) => {
            const isIncome =
              n.kind === "event_income" || n.kind === "loan_ending" || n.kind === "installment_ending";
            const color = isIncome ? "var(--morning-forest)" : "var(--morning-coral)";
            const icon =
              n.kind === "event_income"
                ? "savings"
                : n.kind === "event_expense"
                ? "shopping_cart"
                : n.kind === "loan_ending"
                ? "celebration"
                : "credit_card_off";
            return (
              <li
                key={`${n.month}-${i}`}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "12px 14px",
                  borderBottom:
                    i < noteRows.length - 1
                      ? "1px solid var(--morning-border)"
                      : "none",
                  alignItems: "center",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: isIncome
                      ? "var(--morning-leaf-tint)"
                      : "var(--morning-coral-soft)",
                    color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {icon}
                  </span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: "var(--morning-muted)" }}>
                    {n.monthLabel}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {isIncome ? "+" : "−"}
                  {fmtILS(n.amount)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Manage existing user-defined events */}
      {events.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 8 }}>
            אירועים שהגדרת
          </h2>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              background: "var(--morning-bg)",
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {events.map((e, i) => (
              <li
                key={e.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom:
                    i < events.length - 1 ? "1px solid var(--morning-border)" : "none",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{e.label}</div>
                  <div style={{ fontSize: 11, color: "var(--morning-muted)" }}>
                    {monthName(e.month)} {e.year} · {e.kind === "income" ? "הכנסה" : "הוצאה"}
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    color:
                      e.kind === "income"
                        ? "var(--morning-forest)"
                        : "var(--morning-coral)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {e.kind === "income" ? "+" : "−"}
                  {fmtILS(e.amount)}
                </div>
                <button
                  type="button"
                  onClick={() => removeAnnualEvent(e.year, e.id)}
                  aria-label={`מחק ${e.label}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--morning-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    delete
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editorOpen && (
        <AnnualEventEditor
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Bar chart                                       */
/* ─────────────────────────────────────────────── */

function ForecastChart({ months }: { months: ForecastMonth[] }) {
  if (months.length === 0) {
    return (
      <div
        aria-hidden
        style={{
          marginTop: 12,
          height: 180,
          background: "var(--morning-surface-2)",
          borderRadius: 14,
        }}
      />
    );
  }

  const maxValue = Math.max(
    ...months.map((m) => Math.max(m.income, m.expenses, Math.abs(m.net))),
    1
  );
  const chartHeight = 140;

  return (
    <div
      style={{
        marginTop: 12,
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
        padding: 14,
        boxShadow: "var(--morning-shadow-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "flex-end",
          height: chartHeight,
          marginBottom: 8,
        }}
      >
        {months.map((m) => {
          const incH = (m.income / maxValue) * chartHeight;
          const expH = (m.expenses / maxValue) * chartHeight;
          const isNegative = m.net < 0;
          return (
            <div
              key={`${m.year}-${m.month}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                position: "relative",
              }}
              title={`${m.monthLabel}\nנכנס ${fmtILS(m.income)} · יוצא ${fmtILS(m.expenses)} · נטו ${fmtILS(m.net)}`}
            >
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  alignItems: "flex-end",
                  height: chartHeight,
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "40%",
                    height: incH,
                    background: "var(--morning-forest)",
                    borderRadius: "3px 3px 0 0",
                    minHeight: 2,
                  }}
                />
                <div
                  style={{
                    width: "40%",
                    height: expH,
                    background: isNegative
                      ? "var(--morning-coral)"
                      : "var(--morning-coral-soft)",
                    borderRadius: "3px 3px 0 0",
                    minHeight: 2,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div style={{ display: "flex", gap: 4 }}>
        {months.map((m) => (
          <div
            key={`label-${m.year}-${m.month}`}
            style={{
              flex: 1,
              fontSize: 9,
              color: "var(--morning-muted)",
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            {m.shortLabel.slice(0, 3)}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          justifyContent: "center",
          gap: 14,
          fontSize: 11,
          color: "var(--morning-muted)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: "var(--morning-forest)",
              borderRadius: 2,
            }}
          />
          הכנסה
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: "var(--morning-coral-soft)",
              borderRadius: 2,
            }}
          />
          הוצאה
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Annual event editor — simple bottom sheet      */
/* ─────────────────────────────────────────────── */

function AnnualEventEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const numericAmount = Number(amount.replace(/[^\d.]/g, "")) || 0;
  const canSave = numericAmount > 0 && label.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    addAnnualEvent(year, {
      month,
      kind,
      amount: numericAmount,
      label: label.trim(),
    });
    onSaved();
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear + 1];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16, 24, 40, 0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="הוספת אירוע שנתי"
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--morning-surface)",
          borderTopRightRadius: 24,
          borderTopLeftRadius: 24,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom))",
          boxShadow: "0 -20px 40px rgba(16, 24, 40, 0.15)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "var(--morning-border-strong)",
            margin: "0 auto 14px",
          }}
        />
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>
          הוספת אירוע שנתי
        </h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setKind("income")}
            style={kindButtonStyle(kind === "income", "forest")}
          >
            הכנסה
          </button>
          <button
            type="button"
            onClick={() => setKind("expense")}
            style={kindButtonStyle(kind === "expense", "coral")}
          >
            הוצאה
          </button>
        </div>

        <FormField label="תיאור">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === "income" ? "משכורת 13, מענק, מתנה" : "חופשה, ארנונה, מתנות חגים"}
            style={inputStyle}
          />
        </FormField>

        <FormField label="סכום (₪)">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            style={{ ...inputStyle, fontSize: 22, fontWeight: 800, textAlign: "end" }}
          />
        </FormField>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <FormField label="חודש">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ ...inputStyle, appearance: "auto" }}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="שנה">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ ...inputStyle, appearance: "auto" }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: "0 0 auto",
              padding: "14px 18px",
              fontSize: 14,
              fontWeight: 600,
              background: "var(--morning-surface)",
              color: "var(--morning-ink)",
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: "14px 18px",
              fontSize: 15,
              fontWeight: 700,
              background: canSave ? "var(--morning-forest)" : "var(--morning-surface-3)",
              color: canSave ? "#ffffff" : "var(--morning-subtle)",
              border: "none",
              borderRadius: 12,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", flex: 1, marginBottom: 14 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--morning-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div style={{ marginTop: 6 }}>{children}</div>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 14px",
  fontSize: 14,
  border: "1px solid var(--morning-border)",
  borderRadius: 12,
  background: "var(--morning-bg)",
  color: "var(--morning-ink)",
  outline: "none",
  fontVariantNumeric: "tabular-nums",
};

function kindButtonStyle(active: boolean, tone: "forest" | "coral"): React.CSSProperties {
  const tint = tone === "forest" ? "var(--morning-leaf-tint)" : "var(--morning-coral-soft)";
  const fg = tone === "forest" ? "var(--morning-forest-deep)" : "var(--morning-coral)";
  return {
    flex: 1,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    background: active ? tint : "var(--morning-surface)",
    color: active ? fg : "var(--morning-muted)",
    border: `1px solid ${active ? fg : "var(--morning-border)"}`,
    borderRadius: 12,
    cursor: "pointer",
  };
}

function monthName(m: number): string {
  return [
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
  ][Math.max(0, Math.min(11, m - 1))];
}
