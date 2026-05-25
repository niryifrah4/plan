"use client";

/**
 * /m/budget — Mobile cashflow tool (full end-to-end).
 *
 * This is the mobile companion to the desktop /budget planner.
 * Desktop = plan the budget. Mobile = execute it + see live cashflow.
 *
 * Sections (top → bottom):
 *   1. Header (single line)
 *   2. Cashflow HERO — income · expenses · net
 *   3. Pie toggle — inline donut of WHERE the money went
 *   4. Variable expenses (2-col tile grid) — the click-y stuff
 *   5. Fixed expenses (housing, utilities, insurance, subscriptions)
 *   6. Loans & mortgages
 *   7. Installments (credit-card "תשלומים")
 *   8. FAB "+" → AddExpenseSheet
 *
 * All numbers come from the same localStorage stores the desktop reads,
 * so a change here ripples to the dashboard and vice versa.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { fmtILS } from "@/lib/format";
import {
  buildBudgetLines,
  isFixedCategoryKey,
  type BudgetLine,
} from "@/lib/budget-store";
import {
  householdNetSalary,
  hasSavedSalaryProfile,
  hasSavedSpouseSalaryProfile,
  SALARY_PROFILE_EVENT,
} from "@/lib/salary-engine";
import { getPassiveIncomeSummary } from "@/lib/passive-income";
import {
  loadDebtData,
  getDebtSummary,
  getAllMortgageTracks,
  isLoanActive,
  isInstallmentActive,
  type Loan,
  type Installment,
  type MortgageTrack,
  type DebtData,
} from "@/lib/debt-store";
import { loadParsedTransactions } from "@/lib/budget-import";
import { CategoryDetailSheet, EditCategorySheet } from "./sheets";
import { IncomeSheet } from "./IncomeSheet";
import { AddExpenseSheet } from "./AddExpenseSheet";
import { ForecastView } from "./ForecastView";

const BudgetPie = dynamic(
  () => import("@/app/(client)/budget/BudgetPie").then((m) => m.default),
  { ssr: false, loading: () => <PieSkeleton /> }
);

const HEBREW_MONTH = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });

/** Fixed/variable classification now comes from `BudgetCategory.kind` (set
 *  when the user creates a category on /m). Legacy categories without
 *  `kind` fall back to LEGACY_FIXED_KEYS via isFixedCategoryKey(). */
function isLineFixed(l: BudgetLine): boolean {
  return isFixedCategoryKey(l.key, l.kind);
}

/** Hebrew description keywords that mark a transaction as a debt payment
 *  already accounted for in `verdant:debt_data`. Used to prevent the HERO
 *  from double-counting bank-parsed mortgage/loan rows. */
const DEBT_PAYMENT_KEYWORDS = ["משכנתא", "החזר הלוואה", "הלוואה"];

function isDebtPaymentTransaction(desc: string | undefined): boolean {
  if (!desc) return false;
  return DEBT_PAYMENT_KEYWORDS.some((kw) => desc.includes(kw));
}

/** Sum of this month's transactions that look like debt service. The HERO
 *  subtracts this from variableSpent so debt payments don't show up twice. */
function sumDebtPaidThisMonth(): number {
  if (typeof window === "undefined") return 0;
  try {
    const txs = loadParsedTransactions();
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return txs.reduce((sum, t) => {
      if (!t.date || t.amount <= 0) return sum;
      if (!isDebtPaymentTransaction(t.description)) return sum;
      const d = new Date(t.date);
      if (d.getMonth() !== month || d.getFullYear() !== year) return sum;
      return sum + t.amount;
    }, 0);
  } catch {
    return 0;
  }
}

interface CashflowSnapshot {
  income: number;
  expensesActual: number;
  net: number;
  hasIncome: boolean;
}

export default function MobileBudgetPage() {
  const [lines, setLines] = useState<BudgetLine[] | null>(null);
  const [income, setIncome] = useState<number | null>(null);
  const [debt, setDebt] = useState<DebtData | null>(null);
  const [pieOpen, setPieOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [monthLabel, setMonthLabel] = useState("");
  /** Tile-tap opens this — view transactions + actions. Holds the BudgetLine. */
  const [detailLine, setDetailLine] = useState<BudgetLine | null>(null);
  /**
   * Edit sheet mode:
   *   { mode: "create" }                    → new category
   *   { mode: "edit",  line: BudgetLine }   → edit existing
   * Null = closed.
   */
  const [editState, setEditState] = useState<
    | { mode: "create"; defaultKind: "fixed" | "variable" }
    | { mode: "edit"; line: BudgetLine }
    | null
  >(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [view, setView] = useState<"current" | "forecast">("current");

  const refresh = () => {
    try {
      setLines(buildBudgetLines(0));
    } catch {
      setLines([]);
    }
    try {
      // householdNetSalary covers BOTH primary + spouse profiles. Previously
      // we summed only the primary, which under-reported income by 30–100%
      // for dual-earner households (almost all of Nir's client base).
      const salaryNet = householdNetSalary();
      const passive = getPassiveIncomeSummary();
      setIncome(Math.round(salaryNet + passive.totalMonthly));
    } catch {
      setIncome(0);
    }
    try {
      setDebt(loadDebtData());
    } catch {
      setDebt({ loans: [], installments: [], mortgages: [] });
    }
  };

  useEffect(() => {
    refresh();
    setMonthLabel(HEBREW_MONTH.format(new Date()));

    const onUpdate = () => refresh();
    const events = [
      "verdant:parsed_transactions:updated",
      "verdant:budgets:updated",
      "verdant:debt:updated",
      "verdant:realestate:updated",
      SALARY_PROFILE_EVENT,
      "storage",
    ];
    events.forEach((e) => window.addEventListener(e, onUpdate));
    return () => events.forEach((e) => window.removeEventListener(e, onUpdate));
  }, []);

  /* ── derived ── */
  const variable = useMemo(() => {
    if (!lines) return null;
    return lines
      .filter((l) => !isLineFixed(l))
      .sort((a, b) => {
        const order = { over: 0, warning: 1, safe: 2 } as const;
        const oa = order[a.status];
        const ob = order[b.status];
        if (oa !== ob) return oa - ob;
        return b.pct - a.pct;
      });
  }, [lines]);

  const fixed = useMemo(() => {
    if (!lines) return null;
    return lines.filter((l) => isLineFixed(l));
  }, [lines]);

  const cashflow: CashflowSnapshot | null = useMemo(() => {
    if (!lines || income === null || !debt) return null;
    // Bug fix (finance-agent 2026-05-22): bank-parsed transactions whose
    // description includes "משכנתא" / "החזר הלוואה" get auto-categorised
    // into `housing` / `transport`, which means the same money appears
    // twice in the HERO — once via lines.actual and once via
    // getDebtSummary(). We drop debt-payment transactions from the HERO's
    // variable-spent total so the math is honest. The category tiles
    // themselves still show their raw actuals — adjusting those is a
    // bigger change that touches the desktop too.
    const debtPaidThisMonth = sumDebtPaidThisMonth();
    const rawVariableSpent = lines.reduce((s, l) => s + l.actual, 0);
    const variableSpent = Math.max(0, rawVariableSpent - debtPaidThisMonth);
    const debtSummary = getDebtSummary(debt);
    const totalOut = variableSpent + debtSummary.monthlyTotal;
    return {
      income,
      expensesActual: totalOut,
      net: income - totalOut,
      hasIncome: income > 0,
    };
  }, [lines, income, debt]);

  const pieSlices = useMemo(() => {
    if (!lines) return [];
    return lines
      .filter((l) => l.actual > 0)
      .map((l) => ({
        label: l.label,
        value: l.actual,
        color: l.color,
        section: isLineFixed(l) ? ("fixed" as const) : ("variable" as const),
      }));
  }, [lines]);

  const debtSummary = debt ? getDebtSummary(debt) : null;
  const activeLoans = debt?.loans.filter(isLoanActive) ?? [];
  const activeInstallments = debt?.installments.filter(isInstallmentActive) ?? [];
  const mortgageTracks = debt ? getAllMortgageTracks(debt) : [];

  return (
    <main style={{ color: "var(--morning-ink)" }} dir="rtl">
      {/* GRADIENT BANNER — header + view toggle + cashflow numbers */}
      <section
        style={{
          background:
            "linear-gradient(135deg, var(--morning-forest) 0%, var(--morning-forest-deep) 100%)",
          color: "#ffffff",
          padding: "20px 18px 22px",
          borderRadius: "0 0 20px 20px",
          boxShadow: "0 6px 20px rgba(31, 90, 66, 0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>
            {view === "current" ? "הביצוע" : "תזרים עתידי"}
          </h1>
          <span style={{ fontSize: 12, opacity: 0.78 }}>
            {view === "current" ? monthLabel || "החודש" : "12 חודשים קדימה"}
          </span>
        </div>

        {/* View toggle */}
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            padding: 4,
            background: "rgba(255,255,255,0.12)",
            borderRadius: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setView("current")}
            style={viewToggleStyleDark(view === "current")}
          >
            החודש
          </button>
          <button
            type="button"
            onClick={() => setView("forecast")}
            style={viewToggleStyleDark(view === "forecast")}
          >
            12 חודשים קדימה
          </button>
        </div>

        {view === "current" && (
          <div style={{ marginTop: 16 }}>
            <CashflowHero
              snapshot={cashflow}
              onIncomeClick={() => setIncomeOpen(true)}
            />
          </div>
        )}
      </section>

      <div style={{ padding: "16px 14px 32px" }}>
      {view === "forecast" ? (
        <ForecastView />
      ) : (
        <>
      {/* PIE TOGGLE */}
      <button
        type="button"
        onClick={() => setPieOpen((v) => !v)}
        disabled={pieSlices.length === 0}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "10px 14px",
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 600,
          color: pieSlices.length === 0 ? "var(--morning-subtle)" : "var(--morning-ink)",
          cursor: pieSlices.length === 0 ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            pie_chart
          </span>
          פילוח הוצאות
        </span>
        <span style={{ color: "var(--morning-muted)" }}>{pieOpen ? "▴" : "▾"}</span>
      </button>
      {pieOpen && pieSlices.length > 0 && (
        <div
          style={{
            marginTop: 8,
            background: "var(--morning-surface)",
            border: "1px solid var(--morning-border)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <BudgetPie slices={pieSlices} title="לאן הלך הכסף החודש" mode="actual" />
        </div>
      )}

      {/* DRILL-DOWN SECTIONS — collapsed by default, tap to expand.
          Order: Fixed → Variable → Loans → Installments. Subtotals visible
          in headers so the user gets value without drilling in. */}

      {/* 1. FIXED EXPENSES */}
      <Accordion
        title="הוצאות קבועות"
        count={fixed?.length}
        subtotal={fixed ? fmtILS(fixed.reduce((s, l) => s + l.actual, 0)) : null}
        defaultOpen={false}
        hasAlert={!!fixed?.some((l) => l.status === "over")}
      >
        {!fixed ? (
          <SkeletonList rows={3} />
        ) : (
          <>
            {fixed.length === 0 ? (
              <EmptyBlock>לא הוגדרו הוצאות קבועות.</EmptyBlock>
            ) : (
              <RoundedList>
                {fixed.map((l, i) => (
                  <FixedRow
                    key={l.key}
                    line={l}
                    divider={i < fixed.length - 1}
                    onClick={() => setDetailLine(l)}
                    onEdit={() => setEditState({ mode: "edit", line: l })}
                  />
                ))}
              </RoundedList>
            )}
            <button
              type="button"
              onClick={() => setEditState({ mode: "create", defaultKind: "fixed" })}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "10px 14px",
                background: "transparent",
                border: "1.5px dashed var(--morning-border-strong)",
                borderRadius: 12,
                color: "var(--morning-muted)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                add
              </span>
              הוצאה קבועה חדשה
            </button>
          </>
        )}
      </Accordion>

      {/* 2. VARIABLE EXPENSES */}
      <Accordion
        title="הוצאות משתנות"
        count={variable?.length}
        subtotal={
          variable ? fmtILS(variable.reduce((s, l) => s + l.actual, 0)) : null
        }
        defaultOpen={false}
        hasAlert={!!variable?.some((l) => l.status === "over")}
      >
        {!variable ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            <SkeletonTile />
            <SkeletonTile />
            <SkeletonTile />
            <SkeletonTile />
          </section>
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            {variable.map((l) => (
              <CategoryTile
                key={l.key}
                line={l}
                onClick={() => setDetailLine(l)}
                onEdit={() => setEditState({ mode: "edit", line: l })}
              />
            ))}
            <AddCategoryTile
              onClick={() => setEditState({ mode: "create", defaultKind: "variable" })}
            />
          </section>
        )}
      </Accordion>

      {/* 3. LOANS & MORTGAGES */}
      <Accordion
        title="הלוואות והחזרים"
        count={
          debt ? mortgageTracks.length + activeLoans.length : undefined
        }
        subtotal={
          debtSummary
            ? fmtILS(debtSummary.mortgageMonthly + debtSummary.loansMonthly)
            : null
        }
        defaultOpen={false}
      >
        {!debt ? (
          <SkeletonList rows={2} />
        ) : mortgageTracks.length + activeLoans.length === 0 ? (
          <EmptyBlock>לא נרשמו הלוואות במערכת.</EmptyBlock>
        ) : (
          <RoundedList>
            {mortgageTracks.map((t, i) => (
              <MortgageRow
                key={t.id}
                track={t}
                divider={i < mortgageTracks.length + activeLoans.length - 1}
              />
            ))}
            {activeLoans.map((l, i) => (
              <LoanRow
                key={l.id}
                loan={l}
                divider={
                  mortgageTracks.length + i <
                  mortgageTracks.length + activeLoans.length - 1
                }
              />
            ))}
          </RoundedList>
        )}
      </Accordion>

      {/* 4. INSTALLMENTS */}
      <Accordion
        title="עסקאות תשלומים"
        count={debt ? activeInstallments.length : undefined}
        subtotal={debtSummary ? fmtILS(debtSummary.installmentsMonthly) : null}
        defaultOpen={false}
      >
        {!debt ? (
          <SkeletonList rows={2} />
        ) : activeInstallments.length === 0 ? (
          <EmptyBlock>אין עסקאות תשלומים פעילות.</EmptyBlock>
        ) : (
          <RoundedList>
            {activeInstallments.map((inst, idx) => (
              <InstallmentRow
                key={inst.id}
                installment={inst}
                divider={idx < activeInstallments.length - 1}
              />
            ))}
          </RoundedList>
        )}
      </Accordion>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="הוספת הוצאה"
        style={{
          position: "fixed",
          bottom: "calc(80px + env(safe-area-inset-bottom))",
          insetInlineStart: 16,
          width: 56,
          height: 56,
          background: "var(--morning-forest)",
          color: "#ffffff",
          border: "none",
          borderRadius: 999,
          boxShadow: "var(--morning-shadow-fab)",
          cursor: "pointer",
          zIndex: 40,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
          add
        </span>
      </button>

      {sheetOpen && (
        <AddExpenseSheet
          categories={lines ?? []}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            refresh();
          }}
        />
      )}

      {detailLine && (
        <CategoryDetailSheet
          line={detailLine}
          allCategories={lines ?? []}
          isFixed={isLineFixed(detailLine)}
          onClose={() => setDetailLine(null)}
          onEditCategory={() => {
            // Close detail and open edit immediately for that line.
            setEditState({ mode: "edit", line: detailLine });
            setDetailLine(null);
          }}
          onTransactionsChanged={() => refresh()}
        />
      )}

      {editState && (
        <EditCategorySheet
          line={editState.mode === "edit" ? editState.line : undefined}
          defaultKind={
            editState.mode === "create" ? editState.defaultKind : undefined
          }
          onClose={() => setEditState(null)}
          onSaved={() => {
            setEditState(null);
            refresh();
          }}
        />
      )}

      {incomeOpen && (
        <IncomeSheet
          onClose={() => setIncomeOpen(false)}
          onSaved={() => {
            setIncomeOpen(false);
            refresh();
          }}
        />
      )}
        </>
      )}
      </div>
    </main>
  );
}

function viewToggleStyleDark(active: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    background: active ? "#ffffff" : "transparent",
    color: active ? "var(--morning-forest)" : "rgba(255,255,255,0.85)",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    boxShadow: active ? "0 1px 2px rgba(16, 24, 40, 0.12)" : "none",
    transition: "background 0.15s ease, color 0.15s ease",
  };
}

/* ─────────────────────────────────────────────── */
/* Cashflow Hero                                   */
/* ─────────────────────────────────────────────── */

function CashflowHero({
  snapshot,
  onIncomeClick,
}: {
  snapshot: CashflowSnapshot | null;
  onIncomeClick?: () => void;
}) {
  if (!snapshot) {
    return (
      <div
        aria-hidden
        style={{
          height: 96,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 16,
        }}
      />
    );
  }

  const isPositive = snapshot.net >= 0;

  return (
    <div>
      {/* Two-column income / expenses summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          color: "#ffffff",
        }}
      >
        <HeroCell
          label="הכנסות"
          value={snapshot.income}
          muted={!snapshot.hasIncome}
          onClick={onIncomeClick}
          subline={snapshot.hasIncome ? "לחץ לעדכון ✎" : "להוספה ←"}
        />
        <HeroCell label="הוצאות" value={snapshot.expensesActual} />
      </div>

      {/* Net pill */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "rgba(255,255,255,0.16)",
          backdropFilter: "blur(6px)",
          borderRadius: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#ffffff",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
          {isPositive ? "נטו לחיסכון" : "חריגה מהתזרים"}
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {isPositive ? "+" : ""}
          {fmtILS(snapshot.net)}
        </span>
      </div>

      {!snapshot.hasIncome && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "rgba(255,255,255,0.85)",
            textAlign: "center",
          }}
        >
          הוסף משכורת בלחיצה על "הכנסות" למעלה.
        </div>
      )}
    </div>
  );
}

function HeroCell({
  label,
  value,
  muted = false,
  onClick,
  subline,
}: {
  label: string;
  value: number;
  muted?: boolean;
  onClick?: () => void;
  subline?: string;
}) {
  const Tag: any = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        textAlign: "start",
        cursor: onClick ? "pointer" : "default",
        color: "inherit",
        font: "inherit",
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.78)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 26,
          fontWeight: 800,
          color: muted ? "rgba(255,255,255,0.55)" : "#ffffff",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}
      >
        {fmtILS(value)}
      </div>
      {onClick && subline && (
        <div
          style={{
            marginTop: 2,
            fontSize: 10,
            color: "rgba(255,255,255,0.85)",
            fontWeight: 600,
          }}
        >
          {subline}
        </div>
      )}
    </Tag>
  );
}

/* ─────────────────────────────────────────────── */
/* Section primitives                              */
/* ─────────────────────────────────────────────── */

/* ─────────────────────────────────────────────── */
/* Accordion — drill-down sections                 */
/* ─────────────────────────────────────────────── */

function Accordion({
  title,
  count,
  subtotal,
  defaultOpen = false,
  hasAlert = false,
  children,
}: {
  title: string;
  count?: number;
  subtotal: string | null;
  defaultOpen?: boolean;
  /** finance-agent fix #4: when any child line is over-budget, show a
   *  small red dot next to the title so the family sees a problem
   *  without opening the accordion. */
  hasAlert?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          borderRadius: open ? "14px 14px 0 0" : 14,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          cursor: "pointer",
          textAlign: "start",
          color: "var(--morning-ink)",
          boxShadow: "var(--morning-shadow-card)",
          transition: "border-radius 0.15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              color: "var(--morning-muted)",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
            aria-hidden
          >
            chevron_left
          </span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
          {hasAlert && (
            <span
              aria-label="קטגוריה חורגת מהתקציב"
              title="יש קטגוריה חורגת"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--morning-coral)",
                flexShrink: 0,
              }}
            />
          )}
          {typeof count === "number" && (
            <span
              style={{
                fontSize: 11,
                color: "var(--morning-muted)",
                background: "var(--morning-surface-3)",
                borderRadius: 999,
                padding: "1px 7px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          )}
        </div>
        {subtotal !== null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--morning-ink)",
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {subtotal}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            padding: "10px 0 12px",
            borderInline: "1px solid var(--morning-border)",
            borderBottom: "1px solid var(--morning-border)",
            borderRadius: "0 0 14px 14px",
            background: "var(--morning-bg)",
            paddingInline: 10,
            boxShadow: "var(--morning-shadow-card)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function RoundedList({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "var(--morning-shadow-card)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "20px 16px",
        textAlign: "center",
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: "var(--morning-leaf-tint)",
          color: "var(--morning-forest)",
          margin: "0 auto 10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
          inbox
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--morning-muted)" }}>{children}</div>
    </div>
  );
}

function SkeletonTile() {
  return (
    <div
      aria-hidden
      style={{
        background: "var(--morning-surface-2)",
        border: "1px solid var(--morning-border)",
        borderRadius: 12,
        minHeight: 78,
      }}
    />
  );
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            margin: "8px 0",
            borderRadius: 4,
            background: "var(--morning-surface-3)",
          }}
        />
      ))}
    </div>
  );
}

function PieSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        height: 220,
        background: "var(--morning-surface-2)",
        borderRadius: 12,
      }}
    />
  );
}

/* ─────────────────────────────────────────────── */
/* Tiles & rows                                    */
/* ─────────────────────────────────────────────── */

function CategoryTile({
  line,
  onClick,
  onEdit,
}: {
  line: BudgetLine;
  onClick?: () => void;
  onEdit?: () => void;
}) {
  const pct = line.budget > 0 ? (line.actual / line.budget) * 100 : 0;
  const tone =
    line.status === "over"
      ? "var(--morning-coral)"
      : line.status === "warning"
      ? "var(--morning-warning)"
      : "var(--morning-forest)";
  const numberColor =
    line.status === "over" ? "var(--morning-coral)" : "var(--morning-ink)";

  // The tile renders as a div (not button) so we can host a nested
  // pencil-edit button. Keyboard activation is preserved via tabIndex
  // + onKeyDown.
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "var(--morning-shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 96,
        cursor: onClick ? "pointer" : "default",
        textAlign: "start",
        color: "var(--morning-ink)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: line.color || "var(--morning-forest)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            // Reserve space for the absolutely-positioned pencil so the
            // label doesn't get clipped by it on small screens.
            paddingInlineStart: onEdit ? 24 : 0,
            flex: 1,
          }}
          title={line.label}
        >
          {line.label}
        </div>
      </div>

      {/* BIG numbers — the primary information per Nir 2026-05-24:
          "0 / 4000 זה אמור להיות החלק הגדול, האחוזים זה הקטן." */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: numberColor,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
        }}
      >
        {line.actual.toLocaleString("en-US")} /{" "}
        {line.budget.toLocaleString("en-US")} ₪
      </div>

      {/* Bar + percent as the secondary, smaller signal */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            background: "var(--morning-surface-3)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              height: "100%",
              background: tone,
              borderRadius: 999,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--morning-muted)",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
            minWidth: 28,
            textAlign: "end",
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>

      {/* Pencil — direct edit without going through CategoryDetailSheet */}
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`ערוך את ${line.label}`}
          title="ערוך קטגוריה"
          style={{
            position: "absolute",
            top: 6,
            insetInlineStart: 6,
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: "var(--morning-muted)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            edit
          </span>
        </button>
      )}
    </div>
  );
}

function AddCategoryTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "1.5px dashed var(--morning-border-strong)",
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 78,
        color: "var(--morning-muted)",
        font: "inherit",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
        add
      </span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>קטגוריה חדשה</span>
    </button>
  );
}

function FixedRow({
  line,
  divider,
  onClick,
  onEdit,
}: {
  line: BudgetLine;
  divider: boolean;
  onClick?: () => void;
  onEdit?: () => void;
}) {
  const pct = line.budget > 0 ? (line.actual / line.budget) * 100 : 0;
  const overshoot = line.status === "over";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        padding: "12px 14px",
        borderBottom: divider ? "1px solid var(--morning-border)" : "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        background: "transparent",
        cursor: onClick ? "pointer" : "default",
        textAlign: "start",
        width: "100%",
        color: "var(--morning-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: line.color || "var(--morning-forest)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {line.label}
        </span>
      </div>
      <div style={{ textAlign: "end", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: overshoot ? "var(--morning-coral)" : "var(--morning-ink)",
          }}
        >
          {line.actual.toLocaleString("en-US")} /{" "}
          {line.budget.toLocaleString("en-US")} ₪
        </div>
        <div style={{ fontSize: 11, color: "var(--morning-muted)", marginTop: 1 }}>
          {Math.round(pct)}%
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`ערוך את ${line.label}`}
          title="ערוך קטגוריה"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: "var(--morning-muted)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            edit
          </span>
        </button>
      )}
    </div>
  );
}

function MortgageRow({ track, divider }: { track: MortgageTrack; divider: boolean }) {
  const monthly = track.monthlyPayment || 0;
  return (
    <DebtRow
      title={track.bank ? `משכנתא · ${track.bank}` : "משכנתא"}
      subtitle={track.indexation ?? undefined}
      monthly={monthly}
      divider={divider}
    />
  );
}

function LoanRow({ loan, divider }: { loan: Loan; divider: boolean }) {
  const monthly = loan.monthlyPayment || 0;
  return (
    <DebtRow
      title={loan.lender || "הלוואה"}
      subtitle={loan.totalPayments ? `${loan.totalPayments} תשלומים` : undefined}
      monthly={monthly}
      divider={divider}
    />
  );
}

function DebtRow({
  title,
  subtitle,
  monthly,
  divider,
}: {
  title: string;
  subtitle?: string;
  monthly: number;
  divider: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: divider ? "1px solid var(--morning-border)" : "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "var(--morning-muted)", marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--morning-ink)",
          flexShrink: 0,
        }}
      >
        {fmtILS(monthly)} <span style={{ fontSize: 10, color: "var(--morning-muted)", fontWeight: 500 }}>/חודש</span>
      </div>
    </div>
  );
}

function InstallmentRow({
  installment,
  divider,
}: {
  installment: Installment;
  divider: boolean;
}) {
  const left = Math.max(0, (installment.totalPayments || 0) - (installment.currentPayment || 0));
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: divider ? "1px solid var(--morning-border)" : "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {installment.merchant}
        </div>
        <div style={{ fontSize: 11, color: "var(--morning-muted)", marginTop: 2 }}>
          תשלום {installment.currentPayment}/{installment.totalPayments} · נותרו {left}
        </div>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {fmtILS(installment.monthlyAmount)}
      </div>
    </div>
  );
}

