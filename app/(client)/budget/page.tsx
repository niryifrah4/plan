"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { fmtILS } from "@/lib/format";
import {
  loadDebtData, getDebtSummary, isLoanActive, isInstallmentActive, loanElapsedMonths,
  type DebtData, type Loan, type Installment, type MortgageTrack, type MortgageData,
} from "@/lib/debt-store";

const BudgetChart = dynamic(() => import("./BudgetChart"), { ssr: false });
const MonthlyInsights = dynamic(() => import("./MonthlyInsights"), { ssr: false });

import type { BudgetAdjustment } from "./MonthlyInsights";

/* ═══════════════════════════════════════════════════════════
   Types & Constants
   ═══════════════════════════════════════════════════════════ */

interface SubItem {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
}

interface BudgetRow {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
  subItems?: SubItem[];
}

interface BudgetData {
  year: number;
  month: number;
  sections: Record<string, BudgetRow[]>;
  settled: boolean;
}

type SectionKey = "income" | "fixed" | "variable" | "debt";

/* ── Debt types & helpers imported from @/lib/debt-store (Single Source of Truth) ── */

const SECTION_META: Record<SectionKey, { label: string; icon: string; type: "income" | "expense" | "debt" }> = {
  income:   { label: "הכנסות",              icon: "payments",        type: "income" },
  fixed:    { label: "הוצאות קבועות",       icon: "lock",            type: "expense" },
  variable: { label: "הוצאות משתנות",       icon: "shuffle",         type: "expense" },
  debt:     { label: "תשלומים והלוואות",    icon: "account_balance", type: "debt" },
};

const SECTION_ORDER: SectionKey[] = ["income", "fixed", "variable", "debt"];
const HE_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

/* HOLIDAY_INSIGHTS moved to MonthlyInsights.tsx with full seasonal logic */

const uid = () => "r" + Math.random().toString(36).slice(2, 9);

/* Drilldown categories — categories that can be expanded into sub-items */
const DRILLDOWN_DEFAULTS: Record<string, string[]> = {
  "גן / חינוך": ["גן", "צהרון", "חוגים", "שיעורים פרטיים"],
  "מנויים": ["סטרימינג", "חדר כושר", "אפליקציות", "עיתונות"],
  "ביטוחים": ["ביטוח בריאות", "ביטוח חיים", "ביטוח רכב", "ביטוח דירה"],
  "הלוואת רכב": ["משכנתא", "הלוואת רכב", "הלוואות צרכניות"],
};

function isDrilldownCategory(name: string): boolean {
  return Object.keys(DRILLDOWN_DEFAULTS).some(k => name.includes(k) || k.includes(name));
}

function getDrilldownKey(name: string): string | null {
  for (const k of Object.keys(DRILLDOWN_DEFAULTS)) {
    if (name.includes(k) || k.includes(name)) return k;
  }
  return null;
}

function defaultSubItems(categoryName: string): SubItem[] {
  const key = getDrilldownKey(categoryName);
  if (!key) return [];
  return DRILLDOWN_DEFAULTS[key].map(name => ({
    id: uid(), name, budget: 0, actual: 0, avg3: 0,
  }));
}

/* Check if any sub-item has overspend */
function hasSubOverspend(row: BudgetRow): boolean {
  if (!row.subItems || row.subItems.length === 0) return false;
  return row.subItems.some(s => (Number(s.actual) || 0) > (Number(s.budget) || 0));
}

const DEFAULT_SECTIONS: Record<string, BudgetRow[]> = {
  income: [
    { id: uid(), name: "משכורת נטו", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "הכנסה נוספת", budget: 0, actual: 0, avg3: 0 },
  ],
  fixed: [
    { id: uid(), name: "משכנתא / שכירות", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "ועד בית + ארנונה", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "חשמל", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "מים", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "ביטוחים", budget: 0, actual: 0, avg3: 0, subItems: defaultSubItems("ביטוחים") },
    { id: uid(), name: "גן / חינוך", budget: 0, actual: 0, avg3: 0, subItems: defaultSubItems("גן / חינוך") },
    { id: uid(), name: "מנויים", budget: 0, actual: 0, avg3: 0, subItems: defaultSubItems("מנויים") },
  ],
  variable: [
    { id: uid(), name: "סופר / מזון", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "דלק / תחבורה", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "מסעדות", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "בריאות", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "ביגוד / קניות", budget: 0, actual: 0, avg3: 0 },
    { id: uid(), name: "פנאי ובילוי", budget: 0, actual: 0, avg3: 0 },
  ],
  debt: [
    { id: uid(), name: "הלוואות", budget: 0, actual: 0, avg3: 0, subItems: defaultSubItems("הלוואת רכב") },
    { id: uid(), name: "כרטיסי אשראי", budget: 0, actual: 0, avg3: 0 },
  ],
};

/* ═══════════════════════════════════════════════════════════
   localStorage helpers
   ═══════════════════════════════════════════════════════════ */

function budgetKey(year: number, month: number) {
  return `verdant:budget_${year}_${String(month + 1).padStart(2, "0")}`;
}

function migrateBudget(data: BudgetData): BudgetData {
  // Add subItems to drilldown categories that were saved without them
  for (const key of Object.keys(data.sections)) {
    data.sections[key] = data.sections[key].map(row => {
      if (!row.subItems && getDrilldownKey(row.name)) {
        return { ...row, subItems: defaultSubItems(row.name) };
      }
      return row;
    });
  }
  return data;
}

function loadBudget(year: number, month: number): BudgetData | null {
  try {
    const raw = localStorage.getItem(budgetKey(year, month));
    if (raw) return migrateBudget(JSON.parse(raw));
  } catch {}
  return null;
}

function saveBudget(data: BudgetData) {
  try {
    localStorage.setItem(budgetKey(data.year, data.month), JSON.stringify(data));
  } catch (e) {
    console.warn("[Budget] save failed:", e);
  }
}

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function rowEffective(row: BudgetRow, field: "budget" | "actual"): number {
  if (row.subItems && row.subItems.length > 0) {
    return row.subItems.reduce((s, sub) => s + (Number(sub[field]) || 0), 0);
  }
  return Number(row[field]) || 0;
}

function sectionTotal(rows: BudgetRow[], field: "budget" | "actual") {
  return rows.reduce((s, r) => s + rowEffective(r, field), 0);
}

function gapColor(gap: number, isIncome = false): string {
  if (isIncome) return gap <= 0 ? "#10b981" : "#b91c1c";
  return gap >= 0 ? "#10b981" : "#b91c1c";
}

/* ═══════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function BudgetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [debtData, setDebtData] = useState<DebtData>({ loans: [], installments: [] });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load debt data
  useEffect(() => { setDebtData(loadDebtData()); }, []);

  // Listen for debt data changes (from /debt page)
  useEffect(() => {
    const handler = () => setDebtData(loadDebtData());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Load / init budget on month change — auto-populate active debts
  useEffect(() => {
    const existing = loadBudget(year, month);
    if (existing) {
      setBudget(existing);
    } else {
      // Deep-clone defaults so each month gets its own IDs
      const fresh: BudgetData = {
        year,
        month,
        sections: JSON.parse(JSON.stringify(DEFAULT_SECTIONS)),
        settled: false,
      };
      // Generate fresh IDs
      Object.values(fresh.sections).forEach(rows =>
        rows.forEach(r => { r.id = uid(); r.subItems?.forEach(s => { s.id = uid(); }); }),
      );

      // ═══ Auto-Budget: pull active debts from SSOT ═══
      const debt = loadDebtData();
      const summary = getDebtSummary(debt);

      // Auto-fill mortgage as rigid planned expense in "fixed" section
      if (summary.mortgageMonthly > 0) {
        const mortRow = fresh.sections.fixed.find(r => r.name.includes("משכנתא"));
        if (mortRow) {
          mortRow.budget = summary.mortgageMonthly;
          mortRow.actual = summary.mortgageMonthly; // debt is rigid
        }
      }

      // Auto-fill loans into "debt" section
      if (summary.loansMonthly > 0) {
        const loanRow = fresh.sections.debt.find(r => r.name.includes("הלוואות"));
        if (loanRow) {
          if (loanRow.subItems && loanRow.subItems.length > 0) {
            // Reset sub-items and populate from active loans
            loanRow.subItems = summary.activeLoans.map(l => ({
              id: uid(),
              name: l.lender || "הלוואה",
              budget: l.monthlyPayment || 0,
              actual: l.monthlyPayment || 0,
              avg3: 0,
            }));
            loanRow.budget = summary.loansMonthly;
            loanRow.actual = summary.loansMonthly;
          } else {
            loanRow.budget = summary.loansMonthly;
            loanRow.actual = summary.loansMonthly;
          }
        }
      }

      // Auto-fill installments into "debt" section credit card row
      if (summary.installmentsMonthly > 0) {
        const ccRow = fresh.sections.debt.find(r => r.name.includes("אשראי"));
        if (ccRow) {
          ccRow.budget = summary.installmentsMonthly;
          ccRow.actual = summary.installmentsMonthly;
        }
      }

      setBudget(fresh);
      saveBudget(fresh);
    }
  }, [year, month]);

  // Auto-save with debounce
  const autoSave = useCallback((data: BudgetData) => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveBudget(data);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  }, []);

  // Update a field on a row
  const updateRow = useCallback(
    (sectionKey: string, rowId: string, field: string, value: string | number) => {
      setBudget(prev => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map(r =>
          r.id === rowId ? { ...r, [field]: field === "name" ? value : Number(value) || 0 } : r,
        );
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  const addRow = useCallback((sectionKey: string) => {
    setBudget(prev => {
      if (!prev) return prev;
      const next = { ...prev, sections: { ...prev.sections } };
      next.sections[sectionKey] = [
        ...(next.sections[sectionKey] || []),
        { id: uid(), name: "", budget: 0, actual: 0, avg3: 0 },
      ];
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const deleteRow = useCallback((sectionKey: string, rowId: string) => {
    setBudget(prev => {
      if (!prev) return prev;
      const next = { ...prev, sections: { ...prev.sections } };
      next.sections[sectionKey] = next.sections[sectionKey].filter(r => r.id !== rowId);
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const updateSubItem = useCallback(
    (sectionKey: string, rowId: string, subId: string, field: string, value: string | number) => {
      setBudget(prev => {
        if (!prev) return prev;
        const next = { ...prev, sections: { ...prev.sections } };
        next.sections[sectionKey] = next.sections[sectionKey].map(r => {
          if (r.id !== rowId || !r.subItems) return r;
          const updatedSubs = r.subItems.map(s =>
            s.id === subId ? { ...s, [field]: field === "name" ? value : Number(value) || 0 } : s,
          );
          const subBudget = updatedSubs.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
          const subActual = updatedSubs.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
          return { ...r, subItems: updatedSubs, budget: subBudget, actual: subActual };
        });
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  const addSubItem = useCallback((sectionKey: string, rowId: string) => {
    setBudget(prev => {
      if (!prev) return prev;
      const next = { ...prev, sections: { ...prev.sections } };
      next.sections[sectionKey] = next.sections[sectionKey].map(r => {
        if (r.id !== rowId) return r;
        return { ...r, subItems: [...(r.subItems || []), { id: uid(), name: "", budget: 0, actual: 0, avg3: 0 }] };
      });
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const deleteSubItem = useCallback((sectionKey: string, rowId: string, subId: string) => {
    setBudget(prev => {
      if (!prev) return prev;
      const next = { ...prev, sections: { ...prev.sections } };
      next.sections[sectionKey] = next.sections[sectionKey].map(r => {
        if (r.id !== rowId || !r.subItems) return r;
        const updatedSubs = r.subItems.filter(s => s.id !== subId);
        const subBudget = updatedSubs.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
        const subActual = updatedSubs.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
        return { ...r, subItems: updatedSubs, budget: subBudget, actual: subActual };
      });
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const openNewMonth = useCallback(() => {
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setYear(newYear);
    setMonth(newMonth);
  }, [month, year]);

  // Apply monthly insight recommendations to budget plan values
  const applyInsights = useCallback((adjustments: BudgetAdjustment[]) => {
    setBudget(prev => {
      if (!prev) return prev;
      const next = { ...prev, sections: { ...prev.sections } };

      for (const adj of adjustments) {
        const sectionRows = next.sections[adj.sectionKey];
        if (!sectionRows) continue;

        next.sections[adj.sectionKey] = sectionRows.map(row => {
          // Match by name (partial match to handle names like "סופר / מזון")
          if (!row.name.includes(adj.rowName) && !adj.rowName.includes(row.name)) return row;

          if (row.subItems && row.subItems.length > 0) {
            // For drilldown categories, apply multiplier to each sub-item
            const updatedSubs = row.subItems.map(sub => {
              const currentBudget = Number(sub.budget) || 0;
              if (currentBudget <= 0) return sub;
              const newVal = adj.absolute != null
                ? adj.absolute
                : Math.round(currentBudget * (adj.multiplier || 1));
              return { ...sub, budget: newVal };
            });
            const subBudget = updatedSubs.reduce((s, sub) => s + (Number(sub.budget) || 0), 0);
            return { ...row, subItems: updatedSubs, budget: subBudget };
          } else {
            const currentBudget = Number(row.budget) || 0;
            if (currentBudget <= 0 && adj.absolute == null) return row; // skip zero budgets unless setting absolute
            const newVal = adj.absolute != null
              ? adj.absolute
              : Math.round(currentBudget * (adj.multiplier || 1));
            return { ...row, budget: newVal };
          }
        });
      }

      autoSave(next);
      return next;
    });
  }, [autoSave]);

  // Active debt items
  const activeLoans = useMemo(() => debtData.loans.filter(isLoanActive), [debtData]);
  const activeInstallments = useMemo(() => debtData.installments.filter(isInstallmentActive), [debtData]);
  const debtMonthlyLoans = useMemo(() => activeLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0), [activeLoans]);
  const debtMonthlyInstallments = useMemo(() => activeInstallments.reduce((s, i) => s + (i.monthlyAmount || 0), 0), [activeInstallments]);
  const debtMonthlyMortgage = useMemo(() => (debtData.mortgage?.tracks || []).reduce((s, t) => s + (t.monthlyPayment || 0), 0), [debtData]);
  const debtMonthlyTotal = debtMonthlyLoans + debtMonthlyInstallments + debtMonthlyMortgage;

  // Derived values
  const totals = useMemo(() => {
    if (!budget) return { incBudget: 0, incActual: 0, expBudget: 0, expActual: 0, cfBudget: 0, cfActual: 0, remaining: 0, debtBudget: 0, debtActual: 0 };
    const incBudget = sectionTotal(budget.sections.income || [], "budget");
    const incActual = sectionTotal(budget.sections.income || [], "actual");
    const sectionExpBudget = (["fixed", "variable", "debt"] as const).reduce(
      (s, k) => s + sectionTotal(budget.sections[k] || [], "budget"), 0,
    );
    const sectionExpActual = (["fixed", "variable", "debt"] as const).reduce(
      (s, k) => s + sectionTotal(budget.sections[k] || [], "actual"), 0,
    );
    // Add debt tracker amounts (loans + installments from /debt page)
    const expBudget = sectionExpBudget + debtMonthlyTotal;
    const expActual = sectionExpActual + debtMonthlyTotal; // actual = same as planned for active debts
    return {
      incBudget, incActual,
      expBudget, expActual,
      cfBudget: incBudget - expBudget,
      cfActual: incActual - expActual,
      remaining: expBudget - expActual,
      debtBudget: debtMonthlyTotal,
      debtActual: debtMonthlyTotal,
    };
  }, [budget, debtMonthlyTotal]);

  if (!budget) return null;

  const yearOptions = [year - 1, year, year + 1];

  return (
    <div className="max-w-5xl mx-auto">
      {/* ═══════ Header ═══════ */}
      <header className="mb-6 pb-5 border-b" style={{ borderColor: "#e2e8d8" }}>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-extrabold mb-1" style={{ color: "#5a7a6a" }}>
              Budget Control
            </div>
            <h1 className="text-[22px] font-extrabold tracking-tight leading-tight" style={{ color: "#012d1d" }}>
              תקציב ובקרה
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Year selector */}
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="text-xs font-bold bg-transparent border-b px-1 py-1 cursor-pointer focus:outline-none"
              style={{ color: "#012d1d", borderColor: "#e2e8d8" }}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {/* Month selector */}
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="text-xs font-bold bg-transparent border-b px-1 py-1 cursor-pointer focus:outline-none"
              style={{ color: "#012d1d", borderColor: "#e2e8d8" }}
            >
              {HE_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            {/* New month button */}
            <button
              onClick={openNewMonth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg transition-all hover:opacity-90"
              style={{ background: "#0a7a4a" }}
            >
              <span className="material-symbols-outlined text-[14px]">calendar_add_on</span>
              חודש חדש
            </button>
            {/* Save indicator */}
            {saveStatus !== "idle" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{
                color: saveStatus === "saving" ? "#5a7a6a" : "#10b981",
              }}>
                <span className={`material-symbols-outlined text-[14px] ${saveStatus === "saving" ? "animate-pulse" : ""}`}>
                  {saveStatus === "saving" ? "cloud_sync" : "cloud_done"}
                </span>
                {saveStatus === "saving" ? "שומר..." : "נשמר"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ═══════ KPI Cards ═══════ */}
      <section
        className="bg-white rounded-2xl p-5 md:p-7 mb-4"
        style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-base font-extrabold" style={{ color: "#012d1d" }}>סיכום חודשי</div>
            <div className="text-[11px] font-semibold mt-0.5" style={{ color: "#5a7a6a" }}>
              תכנון מול ביצוע · נתוני {HE_MONTHS[month]} {year}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {/* Total planned */}
          <KpiBox
            label="סה״כ תכנון הוצאות"
            value={fmtILS(totals.expBudget)}
            sub={`הכנסה ${fmtILS(totals.incBudget)}`}
            color="#012d1d"
          />
          {/* Total actual */}
          <KpiBox
            label="סה״כ ביצוע הוצאות"
            value={fmtILS(totals.expActual)}
            sub={`הכנסה ${fmtILS(totals.incActual)}`}
            color={totals.expActual <= totals.expBudget ? "#10b981" : "#b91c1c"}
          />
          {/* Remaining */}
          <KpiBox
            label="יתרה לניצול"
            value={fmtILS(totals.remaining)}
            sub={totals.remaining >= 0 ? "נשאר תקציב" : "חריגה מהתקציב"}
            color={totals.remaining >= 0 ? "#10b981" : "#b91c1c"}
          />
        </div>
      </section>

      {/* ═══════ Comparison Chart ═══════ */}
      <BudgetChart
        incBudget={totals.incBudget}
        incActual={totals.incActual}
        expBudget={totals.expBudget}
        expActual={totals.expActual}
      />

      {/* ═══════ Monthly Insights ═══════ */}
      <MonthlyInsights month={month} year={year} onApply={applyInsights} />

      {/* ═══════ Budget Sections ═══════ */}
      {SECTION_ORDER.map(sectionKey => (
        <BudgetSection
          key={sectionKey}
          sectionKey={sectionKey}
          meta={SECTION_META[sectionKey]}
          rows={budget.sections[sectionKey] || []}
          totalIncome={totals.incBudget}
          onUpdate={updateRow}
          onAdd={addRow}
          onDelete={deleteRow}
          onUpdateSub={updateSubItem}
          onAddSub={addSubItem}
          onDeleteSub={deleteSubItem}
        />
      ))}

      {/* ═══════ Debt Tracker (from /debt page) ═══════ */}
      {(activeLoans.length > 0 || activeInstallments.length > 0) && (
        <DebtTrackerSection
          loans={activeLoans}
          installments={activeInstallments}
          totalIncome={totals.incBudget}
          monthlyTotal={debtMonthlyTotal}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI Box
   ═══════════════════════════════════════════════════════════ */

function KpiBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "#5a7a6a" }}>{label}</div>
      <div className="text-[22px] font-extrabold tracking-tight leading-tight tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>{sub}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Budget Section (card with table)
   ═══════════════════════════════════════════════════════════ */

function pctStr(amount: number, total: number): string {
  if (total <= 0) return "—";
  return ((amount / total) * 100).toFixed(1) + "%";
}

function BudgetSection({
  sectionKey,
  meta,
  rows,
  totalIncome,
  onUpdate,
  onAdd,
  onDelete,
  onUpdateSub,
  onAddSub,
  onDeleteSub,
}: {
  sectionKey: string;
  meta: { label: string; icon: string; type: string };
  rows: BudgetRow[];
  totalIncome: number;
  onUpdate: (section: string, rowId: string, field: string, value: string | number) => void;
  onAdd: (section: string) => void;
  onDelete: (section: string, rowId: string) => void;
  onUpdateSub: (section: string, rowId: string, subId: string, field: string, value: string | number) => void;
  onAddSub: (section: string, rowId: string) => void;
  onDeleteSub: (section: string, rowId: string, subId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const secBudget = sectionTotal(rows, "budget");
  const secActual = sectionTotal(rows, "actual");
  const isIncome = meta.type === "income";
  const ok = isIncome ? secActual >= secBudget : secActual <= secBudget;
  const over = !ok && !isIncome;

  const toggleExpand = (rowId: string) => {
    setExpanded(prev => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  return (
    <section
      className="bg-white rounded-2xl p-5 md:p-7 mb-4"
      style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
    >
      {/* Section header — no pill, color-coded totals only */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#5a7a6a" }}>{meta.icon}</span>
          <div>
            <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>{meta.label}</h2>
            <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
              תכנון <span className="font-extrabold" style={{ color: "#012d1d" }}>{fmtILS(secBudget)}</span>
              {" · "}
              ביצוע <span className="font-extrabold" style={{ color: ok ? "#0a7a4a" : "#b91c1c" }}>{fmtILS(secActual)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overspend warning */}
      {over && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold mb-3" style={{ color: "#b91c1c" }}>
          <span className="material-symbols-outlined text-[13px]">warning</span>
          חריגה של {fmtILS(secActual - secBudget)}
        </div>
      )}

      {/* Column headers */}
      <div
        className="grid items-center pb-1 mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
        style={{
          gridTemplateColumns: "minmax(80px,1fr) 64px 64px 40px 58px 22px",
          color: "#5a7a6a",
          borderBottom: "1px solid #eef2e8",
          columnGap: "8px",
        }}
      >
        <div>קטגוריה</div>
        <div className="text-left tabular-nums">תקציב</div>
        <div className="text-left tabular-nums">ביצוע</div>
        <div className="text-left tabular-nums">%</div>
        <div className="text-left tabular-nums">פער</div>
        <div />
      </div>

      {/* Rows */}
      {rows.map(row => {
        const hasSubs = row.subItems && row.subItems.length > 0;
        const isExpanded = expanded[row.id] ?? false;
        const b = hasSubs ? rowEffective(row, "budget") : (Number(row.budget) || 0);
        const a = hasSubs ? rowEffective(row, "actual") : (Number(row.actual) || 0);
        const gap = b - a;
        const gapPositive = isIncome ? gap <= 0 : gap >= 0;
        const gapStr = (gap > 0 ? "+" : gap < 0 ? "−" : "") + fmtILS(Math.abs(gap));
        const subOverspend = hasSubOverspend(row);

        return (
          <div key={row.id}>
            {/* Parent row */}
            <div
              className="grid items-center py-1.5 group"
              style={{
                gridTemplateColumns: "minmax(80px,1fr) 64px 64px 40px 58px 22px",
                borderBottom: isExpanded ? "none" : "1px solid #eef2e8",
                columnGap: "8px",
              }}
            >
              {/* Name + expand toggle */}
              <div className="flex items-center gap-1.5">
                {hasSubs ? (
                  <button
                    onClick={() => toggleExpand(row.id)}
                    className="flex items-center gap-1 text-[13px] font-semibold bg-transparent border-none cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ color: subOverspend ? "#b91c1c" : "#012d1d" }}
                  >
                    <span
                      className="material-symbols-outlined text-[14px] transition-transform"
                      style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", color: "#5a7a6a" }}
                    >
                      chevron_left
                    </span>
                    {row.name}
                    {subOverspend && (
                      <span className="material-symbols-outlined text-[12px] mr-0.5" style={{ color: "#b91c1c" }}>error</span>
                    )}
                  </button>
                ) : (
                  <input
                    type="text"
                    value={row.name}
                    onChange={e => onUpdate(sectionKey, row.id, "name", e.target.value)}
                    placeholder="שם קטגוריה"
                    className="bg-transparent border-none text-[13px] font-semibold w-full focus:outline-none"
                    style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                  />
                )}
              </div>
              {/* Budget */}
              {hasSubs ? (
                <div className="text-[13px] font-bold text-left tabular-nums" style={{ color: "#012d1d" }}>{fmtILS(b)}</div>
              ) : (
                <input
                  type="number"
                  value={row.budget || ""}
                  onChange={e => onUpdate(sectionKey, row.id, "budget", e.target.value)}
                  placeholder="0"
                  className="bg-transparent border-none text-[13px] font-bold text-left tabular-nums w-full focus:outline-none"
                  style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                  onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                />
              )}
              {/* Actual */}
              {hasSubs ? (
                <div className="text-[13px] font-bold text-left tabular-nums" style={{ color: subOverspend ? "#b91c1c" : "#012d1d" }}>{fmtILS(a)}</div>
              ) : (
                <input
                  type="number"
                  value={row.actual || ""}
                  onChange={e => onUpdate(sectionKey, row.id, "actual", e.target.value)}
                  placeholder="0"
                  className="bg-transparent border-none text-[13px] font-bold text-left tabular-nums w-full focus:outline-none"
                  style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                  onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                />
              )}
              {/* % of income */}
              <div className="text-[11px] font-bold text-left tabular-nums" style={{ color: "#5a7a6a", fontFamily: "Assistant" }}>
                {pctStr(b, totalIncome)}
              </div>
              {/* Gap */}
              <div
                className="text-[12px] font-extrabold text-left tabular-nums"
                style={{ color: gapPositive ? "#0a7a4a" : "#b91c1c" }}
              >
                {gapStr}
              </div>
              {/* Delete */}
              <button
                onClick={() => onDelete(sectionKey, row.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "#5a7a6a" }}
                title="מחק"
              >
                <span className="material-symbols-outlined text-[14px] hover:text-red-600 transition-colors">close</span>
              </button>
            </div>

            {/* Expanded sub-items */}
            {hasSubs && isExpanded && (
              <div
                className="mr-6 mb-2 rounded-xl overflow-hidden"
                style={{ background: "#f8faf5", border: "1px solid #eef2e8" }}
              >
                {row.subItems!.map(sub => {
                  const sb = Number(sub.budget) || 0;
                  const sa = Number(sub.actual) || 0;
                  const sg = sb - sa;
                  const sgPositive = isIncome ? sg <= 0 : sg >= 0;
                  const sgStr = (sg > 0 ? "+" : sg < 0 ? "−" : "") + fmtILS(Math.abs(sg));
                  const subOver = !isIncome && sa > sb && sb > 0;

                  return (
                    <div
                      key={sub.id}
                      className="grid items-center py-1.5 px-3 group/sub"
                      style={{
                        gridTemplateColumns: "minmax(70px,1fr) 64px 64px 40px 58px 22px",
                        borderBottom: "1px solid #eef2e8",
                        columnGap: "8px",
                      }}
                    >
                      {/* Sub name */}
                      <input
                        type="text"
                        value={sub.name}
                        onChange={e => onUpdateSub(sectionKey, row.id, sub.id, "name", e.target.value)}
                        placeholder="פריט"
                        className="bg-transparent border-none text-[12px] font-semibold w-full focus:outline-none"
                        style={{ color: subOver ? "#b91c1c" : "#5a7a6a", borderBottom: "1px dotted transparent" }}
                        onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                        onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                      />
                      {/* Sub budget */}
                      <input
                        type="number"
                        value={sub.budget || ""}
                        onChange={e => onUpdateSub(sectionKey, row.id, sub.id, "budget", e.target.value)}
                        placeholder="0"
                        className="bg-transparent border-none text-[12px] font-bold text-left tabular-nums w-full focus:outline-none"
                        style={{ color: "#012d1d", borderBottom: "1px dotted transparent" }}
                        onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                        onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                      />
                      {/* Sub actual */}
                      <input
                        type="number"
                        value={sub.actual || ""}
                        onChange={e => onUpdateSub(sectionKey, row.id, sub.id, "actual", e.target.value)}
                        placeholder="0"
                        className="bg-transparent border-none text-[12px] font-bold text-left tabular-nums w-full focus:outline-none"
                        style={{ color: subOver ? "#b91c1c" : "#012d1d", borderBottom: "1px dotted transparent" }}
                        onFocus={e => { e.currentTarget.style.borderBottomColor = "#10b981"; }}
                        onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                      />
                      {/* Sub % */}
                      <div className="text-[10px] font-bold text-left tabular-nums" style={{ color: "#5a7a6a", fontFamily: "Assistant" }}>
                        {pctStr(sb, totalIncome)}
                      </div>
                      {/* Sub gap */}
                      <div
                        className="text-[11px] font-extrabold text-left tabular-nums"
                        style={{ color: sgPositive ? "#0a7a4a" : "#b91c1c" }}
                      >
                        {sgStr}
                      </div>
                      {/* Delete sub */}
                      <button
                        onClick={() => onDeleteSub(sectionKey, row.id, sub.id)}
                        className="opacity-0 group-hover/sub:opacity-100 transition-opacity"
                        style={{ color: "#5a7a6a" }}
                        title="מחק פריט"
                      >
                        <span className="material-symbols-outlined text-[13px] hover:text-red-600 transition-colors">close</span>
                      </button>
                    </div>
                  );
                })}
                {/* Add sub-item */}
                <button
                  onClick={() => onAddSub(sectionKey, row.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold transition-colors hover:underline"
                  style={{ color: "#0a7a4a" }}
                >
                  <span className="material-symbols-outlined text-[11px]">add</span>
                  הוסף פריט
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Add row */}
      <button
        onClick={() => onAdd(sectionKey)}
        className="inline-flex items-center gap-1 pt-2 text-[11px] font-bold transition-colors hover:underline"
        style={{ color: "#0a7a4a" }}
      >
        <span className="material-symbols-outlined text-[12px]">add</span>
        הוסף שורה
      </button>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Debt Tracker Section — rigid, read-only from /debt page
   ═══════════════════════════════════════════════════════════ */

function DebtTrackerSection({
  loans,
  installments,
  totalIncome,
  monthlyTotal,
}: {
  loans: Loan[];
  installments: Installment[];
  totalIncome: number;
  monthlyTotal: number;
}) {
  const pctTotal = totalIncome > 0 ? ((monthlyTotal / totalIncome) * 100).toFixed(1) : "—";
  const isCrunch = totalIncome > 0 && monthlyTotal / totalIncome > 0.35;
  const loanMonthly = loans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const instMonthly = installments.reduce((s, i) => s + (i.monthlyAmount || 0), 0);
  const totalRemaining = loans.reduce((s, l) => {
    const remain = Math.max(0, l.totalPayments - loanElapsedMonths(l.startDate));
    return s + remain * (l.monthlyPayment || 0);
  }, 0);

  return (
    <>
      {/* ═══════ Installments Table ═══════ */}
      {installments.length > 0 && (
        <section
          className="bg-white rounded-2xl p-5 md:p-7 mb-4"
          style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#3b82f6" }}>credit_card</span>
            <div>
              <h2 className="text-base font-extrabold" style={{ color: "#012d1d" }}>עסקאות תשלומים</h2>
              <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
                סה&quot;כ חודשי{" "}
                <span className="font-extrabold" style={{ color: "#3b82f6" }}>{fmtILS(instMonthly)}</span>
                {" · "}
                <span style={{ fontFamily: "Assistant" }}>{pctStr(instMonthly, totalIncome)} מההכנסה</span>
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div
            className="grid items-center pb-1 mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
            style={{
              gridTemplateColumns: "minmax(70px,1fr) 60px 60px 64px 50px",
              color: "#5a7a6a",
              borderBottom: "1px solid #eef2e8",
              columnGap: "6px",
            }}
          >
            <div>מוצר</div>
            <div className="text-left">תכנון</div>
            <div className="text-left">מקור</div>
            <div className="text-left">סטטוס</div>
            <div className="text-left">%</div>
          </div>

          {installments.map(inst => (
            <div
              key={inst.id}
              className="grid items-center py-1.5"
              style={{
                gridTemplateColumns: "minmax(70px,1fr) 60px 60px 64px 50px",
                borderBottom: "1px solid #eef2e8",
                columnGap: "6px",
              }}
            >
              <div className="text-[12px] font-semibold truncate" style={{ color: "#012d1d" }}>{inst.merchant || "עסקה"}</div>
              <div className="text-[12px] font-bold text-left tabular-nums" style={{ color: "#3b82f6", fontFamily: "Assistant" }}>
                {fmtILS(inst.monthlyAmount)}
              </div>
              <div className="text-[10px] font-semibold text-left truncate" style={{ color: "#5a7a6a" }}>{inst.source || "—"}</div>
              <div className="text-[11px] font-semibold text-left tabular-nums" style={{ color: "#5a7a6a", fontFamily: "Assistant" }}>
                {inst.currentPayment}/{inst.totalPayments}
              </div>
              <div className="text-[10px] font-bold text-left tabular-nums" style={{ color: "#5a7a6a", fontFamily: "Assistant" }}>
                {pctStr(inst.monthlyAmount, totalIncome)}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ═══════ Loans & Obligations Table ═══════ */}
      {loans.length > 0 && (
        <section
          className="rounded-2xl p-5 md:p-7 mb-4"
          style={{
            background: "#fef8f6",
            border: isCrunch ? "1.5px solid #b91c1c" : "1px solid #f0ddd8",
            boxShadow: "0 1px 2px rgba(124,58,46,.04), 0 8px 24px rgba(124,58,46,.06)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: "#7c3a2e" }}>account_balance</span>
              <div>
                <h2 className="text-base font-extrabold" style={{ color: "#3e1f17" }}>הלוואות והתחייבויות</h2>
                <div className="text-[11px] font-semibold" style={{ color: "#7c3a2e" }}>
                  החזר חודשי{" "}
                  <span className="font-extrabold">{fmtILS(loanMonthly)}</span>
                  {" · "}
                  יתרה לסילוק{" "}
                  <span className="font-extrabold" style={{ fontFamily: "Assistant" }}>{fmtILS(totalRemaining)}</span>
                </div>
              </div>
            </div>
            {isCrunch && (
              <div className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#fee2e2", color: "#991b1b" }}>
                <span className="material-symbols-outlined text-[13px]">warning</span>
                חנק אשראי · {pctTotal}%
              </div>
            )}
          </div>

          {/* Rigid expense label */}
          <div className="flex items-center gap-1 mb-3 text-[10px] font-bold" style={{ color: "#9a6458" }}>
            <span className="material-symbols-outlined text-[11px]">lock</span>
            הוצאה קשיחה — לא ניתנת לצמצום
          </div>

          {/* Column headers */}
          <div
            className="grid items-center pb-1 mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
            style={{
              gridTemplateColumns: "minmax(70px,1fr) 58px 58px 68px 52px",
              color: "#9a6458",
              borderBottom: "1px solid #f0ddd8",
              columnGap: "6px",
            }}
          >
            <div>גוף מלווה</div>
            <div className="text-left">תכנון</div>
            <div className="text-left">ביצוע</div>
            <div className="text-left">יתרה</div>
            <div className="text-left">סטטוס</div>
          </div>

          {/* Loan rows */}
          {loans.map(loan => {
            const elapsed = loanElapsedMonths(loan.startDate);
            const remain = Math.max(0, loan.totalPayments - elapsed);
            const remainingBalance = remain * (loan.monthlyPayment || 0);
            const progressPct = loan.totalPayments > 0 ? (elapsed / loan.totalPayments) * 100 : 0;

            return (
              <div key={loan.id}>
                <div
                  className="grid items-center py-2"
                  style={{
                    gridTemplateColumns: "minmax(70px,1fr) 58px 58px 68px 52px",
                    borderBottom: "1px solid #f0ddd8",
                    columnGap: "6px",
                  }}
                >
                  <div className="text-[12px] font-semibold truncate" style={{ color: "#3e1f17" }}>
                    {loan.lender || "הלוואה"}
                  </div>
                  <div className="text-[12px] font-bold text-left tabular-nums" style={{ color: "#7c3a2e", fontFamily: "Assistant" }}>
                    {fmtILS(loan.monthlyPayment)}
                  </div>
                  <div className="text-[12px] font-bold text-left tabular-nums" style={{ color: "#7c3a2e", fontFamily: "Assistant" }}>
                    {fmtILS(loan.monthlyPayment)}
                  </div>
                  <div className="text-[11px] font-bold text-left tabular-nums" style={{ color: "#3e1f17", fontFamily: "Assistant" }}>
                    {fmtILS(remainingBalance)}
                  </div>
                  <div className="text-[11px] font-semibold text-left tabular-nums" style={{ color: "#9a6458", fontFamily: "Assistant" }}>
                    {elapsed}/{loan.totalPayments}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full mt-0.5 mb-1" style={{ background: "#f0ddd8" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(progressPct, 100)}%`, background: "#7c3a2e" }}
                  />
                </div>
              </div>
            );
          })}

          {/* Totals row */}
          <div
            className="grid items-center py-2 mt-1"
            style={{
              gridTemplateColumns: "minmax(70px,1fr) 58px 58px 68px 52px",
              borderTop: "2px solid #d4a99a",
              columnGap: "6px",
            }}
          >
            <div className="text-[11px] font-extrabold" style={{ color: "#3e1f17" }}>סה&quot;כ</div>
            <div className="text-[12px] font-extrabold text-left tabular-nums" style={{ color: "#7c3a2e", fontFamily: "Assistant" }}>
              {fmtILS(loanMonthly)}
            </div>
            <div className="text-[12px] font-extrabold text-left tabular-nums" style={{ color: "#7c3a2e", fontFamily: "Assistant" }}>
              {fmtILS(loanMonthly)}
            </div>
            <div className="text-[11px] font-extrabold text-left tabular-nums" style={{ color: "#3e1f17", fontFamily: "Assistant" }}>
              {fmtILS(totalRemaining)}
            </div>
            <div className="text-[10px] font-bold text-left" style={{ color: "#9a6458", fontFamily: "Assistant" }}>
              {pctStr(loanMonthly, totalIncome)}
            </div>
          </div>

          {/* Link to debt page */}
          <div className="mt-3 pt-2" style={{ borderTop: "1px solid #f0ddd8" }}>
            <a
              href="/debt"
              className="inline-flex items-center gap-1 text-[11px] font-bold transition-colors hover:underline"
              style={{ color: "#7c3a2e" }}
            >
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
              ניהול הלוואות ותשלומים
            </a>
          </div>
        </section>
      )}
    </>
  );
}
