"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  Client PDF Report — דוח לקוח להדפסה / שמירה כ-PDF
 * ═══════════════════════════════════════════════════════════
 *
 * Reads every localStorage store and assembles a print-optimized
 * Hebrew one-click deliverable. Uses @media print CSS so
 * Cmd+P → Save as PDF produces a clean A4 document.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtILS, fmtPct } from "@/lib/format";
import { scopedKey } from "@/lib/client-scope";
import {
  loadAccounts,
  totalBankBalance,
  totalCreditCharges,
  type AccountsData,
} from "@/lib/accounts-store";
import { loadPensionFunds, type PensionFund } from "@/lib/pension-store";
import { loadProperties, type Property } from "@/lib/realestate-store";
import {
  loadDebtData,
  getDebtSummary,
  type DebtData,
  type DebtSummary,
} from "@/lib/debt-store";
import { loadBuckets } from "@/lib/buckets-store";
import type { Bucket } from "@shared/buckets-core";
import { loadSecurities, totalSecuritiesValue, type SecurityRow } from "@/lib/securities-store";
import {
  loadHistory,
  computeCurrentNetWorth,
  buildSnapshotFromCurrent,
  type NetWorthSnapshot,
  type NetWorthBreakdown,
} from "@/lib/balance-history-store";
import { loadAssumptions, type Assumptions } from "@/lib/assumptions";
import { buildBudgetLines, totalBudget, type BudgetLine } from "@/lib/budget-store";
import { SCOPE_COLORS, effectiveScope, type Scope } from "@/lib/scope-types";

/* ── localStorage keys for form persistence ── */
const LS_NAME_KEY = "verdant:report_client_name";
const LS_RECS_KEY = "verdant:report_recommendations";

/* ── aggregate store state ── */
interface ReportData {
  accounts: AccountsData;
  pension: PensionFund[];
  properties: Property[];
  debtData: DebtData;
  debtSummary: DebtSummary;
  buckets: Bucket[];
  securities: SecurityRow[];
  history: NetWorthSnapshot[];
  assumptions: Assumptions;
  breakdown: NetWorthBreakdown;
  snapshot: NetWorthSnapshot;
  budgetLines: BudgetLine[];
}

function formatHebDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function pct(curr: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((curr / target) * 100));
}

/* ═════════════════════════════════════════════════════ */
/*  MAIN                                                   */
/* ═════════════════════════════════════════════════════ */
export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [clientName, setClientName] = useState("");
  const [recommendations, setRecommendations] = useState("");

  useEffect(() => {
    // Load saved form inputs
    try {
      setClientName(localStorage.getItem(scopedKey(LS_NAME_KEY)) || "");
      setRecommendations(
        localStorage.getItem(scopedKey(LS_RECS_KEY)) ||
          "• לסיים תהליך איחוד חסכונות פנסיונים\n• להגדיל חיסכון חודשי ב-5% השנה הבאה\n• לבחון משכנתא לטובת מיחזור\n• להשלים קרן חירום של 6 חודשי הוצאות"
      );
    } catch {}

    // Load all stores
    const accounts = loadAccounts();
    const pension = loadPensionFunds();
    const properties = loadProperties();
    const debtData = loadDebtData();
    const debtSummary = getDebtSummary(debtData);
    const buckets = loadBuckets();
    const securities = loadSecurities();
    const history = loadHistory();
    const assumptions = loadAssumptions();
    const breakdown = computeCurrentNetWorth();
    const snapshot = buildSnapshotFromCurrent();
    const budgetLines = buildBudgetLines(0);

    setData({
      accounts,
      pension,
      properties,
      debtData,
      debtSummary,
      buckets,
      securities,
      history,
      assumptions,
      breakdown,
      snapshot,
      budgetLines,
    });
  }, []);

  // Persist inputs
  useEffect(() => {
    try {
      localStorage.setItem(scopedKey(LS_NAME_KEY), clientName);
    } catch {}
  }, [clientName]);
  useEffect(() => {
    try {
      localStorage.setItem(scopedKey(LS_RECS_KEY), recommendations);
    } catch {}
  }, [recommendations]);

  const today = formatHebDate();

  if (!data) {
    return <div className="p-6 text-sm text-verdant-muted">טוען נתונים…</div>;
  }

  return (
    <>
      <PrintStyles />
      <div dir="rtl" className="report-root max-w-[210mm] mx-auto">
        {/* Toolbar — screen only */}
        <div className="no-print flex items-center justify-between gap-3 mb-6 p-4 bg-white border rounded-lg"
             style={{ borderColor: "#eef2e8" }}>
          <div className="flex items-center gap-2">
            <Link
              href="/balance"
              className="inline-flex items-center gap-1 text-xs font-bold text-verdant-ink hover:opacity-70"
            >
              <span>→</span> חזרה
            </Link>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <label className="text-[11px] font-bold text-verdant-muted">שם לקוח:</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="לדוגמה — משפחת כהן"
              className="flex-1 max-w-[280px] px-3 py-1.5 text-sm border rounded"
              style={{ borderColor: "#eef2e8" }}
            />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-botanical inline-flex items-center gap-2 text-xs"
          >
            הדפס / שמור PDF
          </button>
        </div>

        {/* ═══ COVER ═══ */}
        <section className="report-section report-cover">
          <div className="text-center py-12">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-verdant-muted mb-4">
              דוח פיננסי — תמונת מצב
            </div>
            <div className="report-h1 text-[32px] font-extrabold text-verdant-ink mb-3">
              {clientName || "שם הלקוח"}
            </div>
            <div className="text-sm text-verdant-muted mb-10">
              תאריך הפקה: {today}
            </div>
            <div className="inline-block border-t-2 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted"
                 style={{ borderColor: "#1B4332", minWidth: 200 }}>
              הופק על-ידי מערכת פלאן
            </div>
          </div>
        </section>

        <NetWorthSection data={data} />
        <CashflowSection data={data} />
        <PensionSection data={data} />
        <RealEstateSection data={data} />
        <SecuritiesSection data={data} />
        <DebtSection data={data} />
        <GoalsSection data={data} />

        {/* ═══ 8. RECOMMENDATIONS ═══ */}
        <section className="report-section mb-6">
          <SectionHeader num={8} title="המלצות ושלבים הבאים" subtitle="פעולות מומלצות לתקופה הקרובה" />
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            rows={8}
            className="w-full p-4 text-sm border rounded-lg bg-white report-recs-text"
            style={{ borderColor: "#eef2e8", fontFamily: "inherit", lineHeight: 1.7 }}
            placeholder="הקלד כאן המלצות ושלבי פעולה ללקוח…"
          />
        </section>

        {/* Footer */}
        <footer className="report-footer pt-6 mt-6 border-t text-center text-[10px] text-verdant-muted"
                style={{ borderColor: "#eef2e8" }}>
          <div>הופק ב-{today} על-ידי מערכת פלאן</div>
          <div className="mt-1">מידע זה הוא תמונת מצב נכון לתאריך ההפקה — אין לראות בו ייעוץ פיננסי.</div>
        </footer>
      </div>
    </>
  );
}

/* ═════════════════════════════════════════════════════ */
/*  SECTIONS                                               */
/* ═════════════════════════════════════════════════════ */

function SectionHeader({
  num,
  title,
  subtitle,
}: {
  num: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-1 self-stretch rounded" style={{ background: "#1B4332", minHeight: 36 }} />
      <div className="flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
          חלק {num}
        </div>
        <h2 className="report-h2 text-lg font-extrabold text-verdant-ink">{title}</h2>
        {subtitle && <div className="text-[11px] text-verdant-muted mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

function Empty({ text = "לא נוספו נתונים" }: { text?: string }) {
  return <div className="text-[11px] text-verdant-muted italic py-2">{text}</div>;
}

/* ── 1. Net Worth ── */
function NetWorthSection({ data }: { data: ReportData }) {
  const b = data.breakdown;
  const snap = data.snapshot;
  const assetsParts = [
    { label: "מזומן", v: b.cash },
    { label: "השקעות", v: b.investments },
    { label: "פנסיוני", v: b.pension },
    { label: "נדל״ן", v: b.realestate },
    { label: "מטרות (קופות)", v: b.goals },
  ];
  const maxAsset = Math.max(1, ...assetsParts.map((a) => a.v));
  return (
    <section className="report-section mb-6">
      <SectionHeader num={1} title="תמונת מצב — שווי נקי" subtitle="סיכום נכסים והתחייבויות" />
      <div className="rounded-lg p-6 mb-4" style={{ background: "#f4f7ed" }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
          שווי נקי כולל
        </div>
        <div className="text-[36px] font-extrabold text-verdant-ink leading-tight">
          {fmtILS(snap.netWorth)}
        </div>
        <div className="text-xs text-verdant-muted mt-1">
          נכסים {fmtILS(snap.totalAssets)} · התחייבויות {fmtILS(snap.totalLiabilities)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] font-bold text-verdant-ink mb-2">פירוט נכסים</div>
          <div className="space-y-1.5">
            {assetsParts.map((a) => (
              <div key={a.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-verdant-ink">{a.label}</span>
                  <span className="font-bold text-verdant-ink">{fmtILS(a.v)}</span>
                </div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: "#eef2e8" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(a.v / maxAsset) * 100}%`, background: "#1B4332" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-verdant-ink mb-2">פירוט התחייבויות</div>
          <table className="w-full text-[11px]">
            <tbody>
              <tr>
                <td className="py-1 text-verdant-ink">משכנתאות</td>
                <td className="py-1 text-left font-bold">{fmtILS(b.mortgages)}</td>
              </tr>
              <tr style={{ background: "#f4f7ed" }}>
                <td className="py-1 text-verdant-ink">הלוואות ותשלומים</td>
                <td className="py-1 text-left font-bold">{fmtILS(b.debt)}</td>
              </tr>
              <tr>
                <td className="py-1 text-verdant-ink font-bold">סה״כ</td>
                <td className="py-1 text-left font-extrabold">{fmtILS(snap.totalLiabilities)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── 2. Cashflow ── */
function CashflowSection({ data }: { data: ReportData }) {
  const lines = data.budgetLines || [];
  const hasBudget = lines.length > 0;
  const totals = hasBudget ? totalBudget(lines) : { budget: 0, actual: 0, remaining: 0 };
  const a = data.assumptions;

  // Read raw budget JSON to compute scope split (buildBudgetLines drops the scope field).
  let scopeSplit: { personal: number; business: number } | null = null;
  if (typeof window !== "undefined") {
    try {
      const now = new Date();
      const key = `verdant:budget_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
      const raw = localStorage.getItem(scopedKey(key));
      if (raw) {
        const parsed = JSON.parse(raw) as { sections?: Record<string, { budget?: number; scope?: Scope; subItems?: { budget?: number }[] }[]> };
        let p = 0, b = 0, has = false;
        for (const sk of ["fixed", "variable"] as const) {
          for (const r of parsed.sections?.[sk] || []) {
            const subSum = Array.isArray(r.subItems) && r.subItems.length > 0
              ? r.subItems.reduce((s, sub) => s + (Number(sub.budget) || 0), 0)
              : 0;
            const amt = subSum > 0 ? subSum : (Number(r.budget) || 0);
            const eff = effectiveScope(r.scope);
            if (eff === "business") { b += amt; has = true; }
            else if (eff === "mixed") { b += amt / 2; p += amt / 2; has = true; }
            else p += amt;
          }
        }
        if (has) scopeSplit = { personal: p, business: b };
      }
    } catch {}
  }

  return (
    <section className="report-section mb-6">
      <SectionHeader num={2} title="תזרים חודשי" subtitle="הכנסות מול הוצאות לחודש הנוכחי" />
      {!hasBudget ? (
        <div className="grid grid-cols-4 gap-3">
          <Stat label="הכנסה חודשית" value={fmtILS(a.monthlyIncome)} />
          <Stat label="הוצאה חודשית" value={fmtILS(a.monthlyExpenses)} />
          <Stat label="חיסכון חודשי" value={fmtILS(a.monthlyInvestment)} />
          <Stat label="עודף" value={fmtILS(a.monthlyIncome - a.monthlyExpenses)} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="תקציב חודשי" value={fmtILS(totals.budget)} />
          <Stat label="ביצוע בפועל" value={fmtILS(totals.actual)} />
          <Stat
            label="יתרה"
            value={fmtILS(totals.remaining)}
            valueClass={totals.remaining >= 0 ? "text-verdant-emerald" : "text-red-600"}
          />
        </div>
      )}

      {/* Business / personal split — only when there's at least one business row */}
      {scopeSplit && (
        <div className="mt-3 rounded-lg p-3 border text-[11px]" style={{ borderColor: "#eef2e8", background: "#fafbf7" }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: "#5a7a6a" }}>
            חלוקת הוצאות — עסקי / פרטי
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold" style={{ color: SCOPE_COLORS.personal }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: SCOPE_COLORS.personal }} />
              פרטי
            </span>
            <span className="tabular-nums font-bold" style={{ color: "#012d1d" }}>
              {fmtILS(Math.round(scopeSplit.personal))}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="flex items-center gap-1.5 font-bold" style={{ color: SCOPE_COLORS.business }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: SCOPE_COLORS.business }} />
              עסקי
            </span>
            <span className="tabular-nums font-bold" style={{ color: "#012d1d" }}>
              {fmtILS(Math.round(scopeSplit.business))}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg p-3 border" style={{ borderColor: "#eef2e8", background: "#fff" }}>
      <div className="caption">
        {label}
      </div>
      <div className={`text-lg font-extrabold text-verdant-ink mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}

/* ── 3. Pension ── */
function PensionSection({ data }: { data: ReportData }) {
  const funds = data.pension;
  const a = data.assumptions;
  const totalBalance = funds.reduce((s, f) => s + (f.balance || 0), 0);
  const totalContrib = funds.reduce((s, f) => s + (f.monthlyContrib || 0), 0);
  const yearsToRet = Math.max(0, a.retirementAge - a.currentAge);
  // Simple projected balance at retirement
  const r = Math.max(0, a.expectedReturnPension - a.managementFeePension);
  const months = yearsToRet * 12;
  const mRate = r / 12;
  const futureBalance =
    totalBalance * Math.pow(1 + r, yearsToRet) +
    (mRate > 0
      ? totalContrib * ((Math.pow(1 + mRate, months) - 1) / mRate)
      : totalContrib * months);
  // Estimate pension at conversion factor ~200 (new fund default)
  const estPension = futureBalance / 200;

  return (
    <section className="report-section mb-6">
      <SectionHeader num={3} title="חסכון פנסיוני" subtitle="קרנות פנסיה, השתלמות וגמל" />
      {funds.length === 0 ? (
        <Empty />
      ) : (
        <>
          <table className="w-full text-[11px] mb-4">
            <thead>
              <tr style={{ background: "#eef2e8" }}>
                <th className="text-right p-2 font-bold text-verdant-ink">קרן</th>
                <th className="text-right p-2 font-bold text-verdant-ink">סוג</th>
                <th className="text-right p-2 font-bold text-verdant-ink">מסלול</th>
                <th className="text-left p-2 font-bold text-verdant-ink">צבירה</th>
                <th className="text-left p-2 font-bold text-verdant-ink">דמי ניהול (הפקדה/צבירה)</th>
                <th className="text-left p-2 font-bold text-verdant-ink">הפקדה חודשית</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f, i) => (
                <tr
                  key={f.id}
                  style={{ background: i % 2 === 0 ? "#fff" : "#f4f7ed" }}
                >
                  <td className="p-2 text-verdant-ink">{f.company}</td>
                  <td className="p-2 text-verdant-ink">{typeLabel(f.type)}</td>
                  <td className="p-2 text-verdant-ink">{f.track}</td>
                  <td className="p-2 text-left font-bold">{fmtILS(f.balance)}</td>
                  <td className="p-2 text-left">
                    {fmtPct(f.mgmtFeeDeposit)} / {fmtPct(f.mgmtFeeBalance)}
                  </td>
                  <td className="p-2 text-left">{fmtILS(f.monthlyContrib)}</td>
                </tr>
              ))}
              <tr style={{ background: "#1B4332", color: "#fff" }}>
                <td className="p-2 font-bold" colSpan={3}>סה״כ</td>
                <td className="p-2 text-left font-extrabold">{fmtILS(totalBalance)}</td>
                <td className="p-2"></td>
                <td className="p-2 text-left font-extrabold">{fmtILS(totalContrib)}</td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="גיל נוכחי" value={`${a.currentAge}`} />
            <Stat label="גיל פרישה" value={`${a.retirementAge}`} />
            <Stat label="קצבה חזויה בפרישה" value={`${fmtILS(estPension)} / חודש`} />
          </div>
        </>
      )}
    </section>
  );
}

function typeLabel(t: PensionFund["type"]): string {
  switch (t) {
    case "pension":
      return "פנסיה";
    case "gemel":
      return "גמל";
    case "hishtalmut":
      return "השתלמות";
    case "bituach":
      return "ביטוח";
    default:
      return t;
  }
}

/* ── 4. Real Estate ── */
function RealEstateSection({ data }: { data: ReportData }) {
  const props = data.properties;
  if (props.length === 0) {
    return (
      <section className="report-section mb-6">
        <SectionHeader num={4} title="נדל״ן" subtitle="נכסים פיזיים" />
        <Empty />
      </section>
    );
  }
  return (
    <section className="report-section mb-6">
      <SectionHeader num={4} title="נדל״ן" subtitle="נכסים פיזיים" />
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ background: "#eef2e8" }}>
            <th className="text-right p-2 font-bold text-verdant-ink">נכס</th>
            <th className="text-right p-2 font-bold text-verdant-ink">סוג</th>
            <th className="text-left p-2 font-bold text-verdant-ink">שווי נוכחי</th>
            <th className="text-left p-2 font-bold text-verdant-ink">יתרת משכנתא</th>
            <th className="text-left p-2 font-bold text-verdant-ink">הון עצמי</th>
            <th className="text-left p-2 font-bold text-verdant-ink">שכ״ד / הוצאות</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p, i) => {
            const equity = (p.currentValue || 0) - (p.mortgageBalance || 0);
            return (
              <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f4f7ed" }}>
                <td className="p-2 text-verdant-ink font-bold">{p.name}</td>
                <td className="p-2 text-verdant-ink">{reTypeLabel(p.type)}</td>
                <td className="p-2 text-left font-bold">{fmtILS(p.currentValue)}</td>
                <td className="p-2 text-left">{fmtILS(p.mortgageBalance || 0)}</td>
                <td className="p-2 text-left font-bold">{fmtILS(equity)}</td>
                <td className="p-2 text-left">
                  {p.monthlyRent
                    ? `${fmtILS(p.monthlyRent)} / ${fmtILS(p.monthlyExpenses || 0)}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function reTypeLabel(t: Property["type"]): string {
  switch (t) {
    case "residence":
      return "מגורים";
    case "investment":
      return "השקעה";
    case "commercial":
      return "מסחרי";
    case "land":
      return "קרקע";
    default:
      return t;
  }
}

/* ── 5. Securities ── */
function SecuritiesSection({ data }: { data: ReportData }) {
  const rows = data.securities;
  const total = totalSecuritiesValue(rows);
  const totalPnl = rows.reduce((s, r) => s + (r.unrealized_pnl_ils || 0), 0);
  if (rows.length === 0) {
    return (
      <section className="report-section mb-6">
        <SectionHeader num={5} title="השקעות" subtitle="תיק ניירות ערך" />
        <Empty />
      </section>
    );
  }
  return (
    <section className="report-section mb-6">
      <SectionHeader num={5} title="השקעות" subtitle="תיק ניירות ערך" />
      <table className="w-full text-[11px] mb-3">
        <thead>
          <tr style={{ background: "#eef2e8" }}>
            <th className="text-right p-2 font-bold text-verdant-ink">נייר</th>
            <th className="text-right p-2 font-bold text-verdant-ink">סוג</th>
            <th className="text-left p-2 font-bold text-verdant-ink">כמות</th>
            <th className="text-left p-2 font-bold text-verdant-ink">שווי שוק</th>
            <th className="text-left p-2 font-bold text-verdant-ink">רווח/הפסד</th>
            <th className="text-left p-2 font-bold text-verdant-ink">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f4f7ed" }}>
              <td className="p-2 text-verdant-ink font-bold">{r.symbol}</td>
              <td className="p-2 text-verdant-ink">{r.kind}</td>
              <td className="p-2 text-left">{r.quantity}</td>
              <td className="p-2 text-left font-bold">{fmtILS(r.market_value_ils)}</td>
              <td className="p-2 text-left">{fmtILS(r.unrealized_pnl_ils)}</td>
              <td className="p-2 text-left">{fmtPct(r.unrealized_pnl_pct * 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="שווי שוק כולל" value={fmtILS(total)} />
        <Stat label="רווח/הפסד לא ממומש" value={fmtILS(totalPnl)} />
      </div>
    </section>
  );
}

/* ── 6. Debt ── */
function DebtSection({ data }: { data: ReportData }) {
  const s = data.debtSummary;
  const m = data.debtData.mortgage;
  return (
    <section className="report-section mb-6">
      <SectionHeader num={6} title="חובות והתחייבויות" subtitle="משכנתאות והלוואות פעילות" />
      {m && m.tracks.length > 0 && (
        <>
          <div className="text-[11px] font-bold text-verdant-ink mb-2">
            משכנתא — {m.bank || "לא צוין"}
          </div>
          <table className="w-full text-[11px] mb-4">
            <thead>
              <tr style={{ background: "#eef2e8" }}>
                <th className="text-right p-2 font-bold text-verdant-ink">מסלול</th>
                <th className="text-right p-2 font-bold text-verdant-ink">שיטה</th>
                <th className="text-left p-2 font-bold text-verdant-ink">ריבית</th>
                <th className="text-left p-2 font-bold text-verdant-ink">יתרה</th>
                <th className="text-left p-2 font-bold text-verdant-ink">החזר חודשי</th>
              </tr>
            </thead>
            <tbody>
              {m.tracks.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#f4f7ed" }}>
                  <td className="p-2 text-verdant-ink">{t.name}</td>
                  <td className="p-2 text-verdant-ink">{t.repaymentMethod}</td>
                  <td className="p-2 text-left">{fmtPct(t.interestRate)}</td>
                  <td className="p-2 text-left font-bold">{fmtILS(t.remainingBalance)}</td>
                  <td className="p-2 text-left">{fmtILS(t.monthlyPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {s.activeLoans.length > 0 && (
        <>
          <div className="text-[11px] font-bold text-verdant-ink mb-2">הלוואות פעילות</div>
          <table className="w-full text-[11px] mb-4">
            <thead>
              <tr style={{ background: "#eef2e8" }}>
                <th className="text-right p-2 font-bold text-verdant-ink">נותן הלוואה</th>
                <th className="text-left p-2 font-bold text-verdant-ink">תחילה</th>
                <th className="text-left p-2 font-bold text-verdant-ink">תשלומים סה״כ</th>
                <th className="text-left p-2 font-bold text-verdant-ink">החזר חודשי</th>
              </tr>
            </thead>
            <tbody>
              {s.activeLoans.map((l, i) => (
                <tr key={l.id} style={{ background: i % 2 === 0 ? "#fff" : "#f4f7ed" }}>
                  <td className="p-2 text-verdant-ink">{l.lender}</td>
                  <td className="p-2 text-left">{l.startDate}</td>
                  <td className="p-2 text-left">{l.totalPayments}</td>
                  <td className="p-2 text-left font-bold">{fmtILS(l.monthlyPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!m && s.activeLoans.length === 0 && s.activeInstallments.length === 0 && <Empty />}

      <div className="grid grid-cols-3 gap-3 mt-3">
        <Stat label="סה״כ יתרות" value={fmtILS(s.mortgageBalance + s.loansBalance)} />
        <Stat label="החזר חודשי כולל" value={fmtILS(s.monthlyTotal)} />
        <Stat label="ריבית משכנתא ממוצעת" value={fmtPct(s.mortgageAvgInterest)} />
      </div>
    </section>
  );
}

/* ── 7. Goals / Buckets ── */
function GoalsSection({ data }: { data: ReportData }) {
  const buckets = data.buckets;
  if (buckets.length === 0) {
    return (
      <section className="report-section mb-6">
        <SectionHeader num={7} title="מטרות חיים" subtitle="קופות ויעדים ארוכי טווח" />
        <Empty />
      </section>
    );
  }
  return (
    <section className="report-section mb-6">
      <SectionHeader num={7} title="מטרות חיים" subtitle="קופות ויעדים ארוכי טווח" />
      <div className="space-y-3">
        {buckets.map((b) => {
          const p = pct(b.currentAmount || 0, b.targetAmount || 0);
          return (
            <div key={b.id} className="rounded-lg p-3 border" style={{ borderColor: "#eef2e8" }}>
              <div className="flex items-center justify-between">
                <div className="font-bold text-verdant-ink text-sm">{b.name}</div>
                <div className="text-[11px] text-verdant-muted">
                  יעד: {formatHebDate(b.targetDate)}
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <div className="text-verdant-ink">
                  {fmtILS(b.currentAmount)} / {fmtILS(b.targetAmount)}
                </div>
                <div className="font-bold text-verdant-emerald">{p}%</div>
              </div>
              <div className="h-2 rounded-full mt-2" style={{ background: "#eef2e8" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${p}%`, background: "#1B4332" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════ */
/*  PRINT CSS                                              */
/* ═════════════════════════════════════════════════════ */
function PrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        .no-print {
          display: none !important;
        }

        /* Hide the ClientShell sidebar (aside) and reset main margin */
        aside {
          display: none !important;
        }
        main {
          margin: 0 !important;
          padding: 0 !important;
        }

        @page {
          size: A4 portrait;
          margin: 14mm 12mm;
        }

        html,
        body {
          background: #ffffff !important;
          color: #012d1d;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .report-root {
          max-width: 100% !important;
          margin: 0 !important;
        }

        .report-section {
          break-inside: avoid;
          page-break-inside: avoid;
          margin-bottom: 14pt !important;
        }

        .report-section-break {
          page-break-before: always;
        }

        .report-cover {
          min-height: 60vh;
        }

        .report-body {
          font-size: 10pt;
          line-height: 1.4;
        }

        .report-h1 {
          font-size: 22pt !important;
        }

        .report-h2 {
          font-size: 13pt !important;
        }

        table {
          border-collapse: collapse;
          width: 100%;
        }

        thead {
          display: table-header-group;
        }

        tr {
          page-break-inside: avoid;
        }

        /* Textarea renders as plain text in print */
        textarea.report-recs-text {
          border: none !important;
          resize: none !important;
          overflow: visible !important;
          height: auto !important;
          background: transparent !important;
          padding: 0 !important;
          font-size: 10pt !important;
          white-space: pre-wrap;
        }

        input {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
        }
      }
    `}</style>
  );
}
