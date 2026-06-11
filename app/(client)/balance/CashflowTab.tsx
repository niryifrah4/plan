"use client";

/**
 * Cashflow Tab — "מה הגיע ולאן הלך"
 *
 * Sits in `/balance` next to WealthTab + AccountsTab. Shows every saved
 * transaction (`verdant:parsed_transactions`) broken into a 2×2 matrix:
 *
 *                    PERSONAL          BUSINESS
 *                   ┌──────────────────────────────────┐
 *           FIXED   │  housing, utils, ...             │ tax, payment fees
 *                   │                                  │
 *        VARIABLE   │  food, dining, ...               │ ads, freelance, …
 *                   └──────────────────────────────────┘
 *
 * Business columns appear only when the household has at least one עצמאי
 * (auto-detected from the onboarding employment type). This is the page Nir
 * asked for: "המטרה שלי לייצר הפרדה בין ההוצאות העסקיות להוצאות של החיים
 * עצמם — אנחנו עוד חלשים בזה".
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtILS } from "@/lib/format";
import type { ParsedTransaction } from "@/lib/doc-parser/types";
import { scopedKey } from "@/lib/client-scope";
import {
  buildCashflowBreakdown,
  type BucketBreakdown,
} from "@/lib/cashflow-breakdown";
import { isBusinessScopeEnabled, BUSINESS_SCOPE_EVENT } from "@/lib/business-scope";

const STORAGE_KEY = "verdant:parsed_transactions";

function loadParsedTransactions(): ParsedTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function CashflowTab() {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [businessEnabled, setBusinessEnabled] = useState(false);

  useEffect(() => {
    const reload = () => setTransactions(loadParsedTransactions());
    reload();
    window.addEventListener("verdant:parsed_transactions:updated", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("verdant:parsed_transactions:updated", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  useEffect(() => {
    setBusinessEnabled(isBusinessScopeEnabled());
    const h = () => setBusinessEnabled(isBusinessScopeEnabled());
    window.addEventListener(BUSINESS_SCOPE_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(BUSINESS_SCOPE_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);

  const bd = useMemo(() => buildCashflowBreakdown(transactions), [transactions]);

  if (transactions.length === 0) {
    return (
      <div className="card-pad py-12 text-center">
        <span className="material-symbols-outlined mb-2 block text-[36px] text-verdant-muted">
          analytics
        </span>
        <h3 className="mb-1 text-base font-extrabold text-verdant-ink">אין עדיין נתוני תזרים</h3>
        <p className="text-sm text-verdant-muted">
          העלה דפי בנק וכרטיסי אשראי דרך{" "}
          <Link href="/files" className="text-verdant-emerald underline">
            קבצים במיפוי
          </Link>{" "}
          כדי להתחיל
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        subtitle="Cashflow Breakdown · תזרים"
        title="מה הגיע ולאן הלך"
        description={`${bd.monthsCovered} חודשי נתונים · ${formatPeriod(bd.periodFrom)} → ${formatPeriod(bd.periodTo)}`}
      />

      {/* Top-level KPIs — monthly averages */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="הכנסה חודשית"
          value={fmtILS(bd.totalIncome / bd.monthsCovered)}
          color="#059669"
          icon="trending_up"
        />
        <KpiCard
          label="הוצאה חודשית"
          value={fmtILS(bd.monthlyBurn)}
          color="#DC2626"
          icon="trending_down"
        />
        <KpiCard
          label="עודף חודשי"
          value={fmtILS(bd.monthlyNet)}
          color={bd.monthlyNet >= 0 ? "#059669" : "#DC2626"}
          icon={bd.monthlyNet >= 0 ? "savings" : "warning"}
        />
        <KpiCard
          label="שיעור חיסכון"
          value={`${Math.round(bd.savingRate * 100)}%`}
          color={bd.savingRate >= 0.1 ? "#059669" : "#B45309"}
          icon="percent"
        />
      </div>

      {/* Parent groups — high-level "where did the money go" view */}
      {bd.byParent.length > 0 && (
        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
              donut_large
            </span>
            <h3 className="text-sm font-extrabold text-verdant-ink">פיזור לפי קבוצות הוצאה</h3>
            <span className="mr-auto text-[10px] font-bold text-verdant-muted">
              סה״כ הוצאה לחודש: {fmtILS(bd.monthlyBurn)}
            </span>
          </div>
          <div className="space-y-1.5">
            {bd.byParent
              .filter((g) => g.expense > 0)
              .map((g) => {
                const monthly = g.expense / bd.monthsCovered;
                const pct = bd.totalExpense > 0 ? (g.expense / bd.totalExpense) * 100 : 0;
                return (
                  <div key={g.parent.key} className="flex items-center gap-3">
                    <span
                      className="material-symbols-outlined text-[16px]"
                      style={{ color: g.parent.color }}
                    >
                      {g.parent.icon}
                    </span>
                    <span className="w-32 truncate text-xs font-bold text-verdant-ink">
                      {g.parent.label}
                    </span>
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full"
                      style={{ background: "#FAFAF7" }}
                    >
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, background: g.parent.color }}
                      />
                    </div>
                    <span className="tabular w-20 text-left text-xs font-bold text-verdant-muted">
                      {fmtILS(monthly)}/ח׳
                    </span>
                    <span className="tabular w-10 text-left text-[10px] text-verdant-muted">
                      {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Fixed/Variable summary row */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryStrip
          label="הוצאות קבועות חודשיות"
          value={
            (bd.buckets.fixedPersonal.expenseTotal + bd.buckets.fixedBusiness.expenseTotal) /
            bd.monthsCovered
          }
          totalCount={
            bd.buckets.fixedPersonal.txCount + bd.buckets.fixedBusiness.txCount
          }
          accent="#1B4332"
          hint="דיור, חשבונות, ביטוחים, מנויים, פנסיה"
        />
        <SummaryStrip
          label="הוצאות משתנות חודשיות"
          value={
            (bd.buckets.variablePersonal.expenseTotal +
              bd.buckets.variableBusiness.expenseTotal) /
            bd.monthsCovered
          }
          totalCount={
            bd.buckets.variablePersonal.txCount + bd.buckets.variableBusiness.txCount
          }
          accent="#B45309"
          hint="מזון, תחבורה, פנאי, קניות, בריאות"
        />
      </div>

      {/* The 2×2 matrix */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BucketCard
          title="קבועות · פרטי"
          icon="home"
          bucket={bd.buckets.fixedPersonal}
          months={bd.monthsCovered}
          accent="#1B4332"
        />
        {businessEnabled && (
          <BucketCard
            title="קבועות · עסקי"
            icon="business_center"
            bucket={bd.buckets.fixedBusiness}
            months={bd.monthsCovered}
            accent="#7C3AED"
          />
        )}
        <BucketCard
          title="משתנות · פרטי"
          icon="shopping_cart"
          bucket={bd.buckets.variablePersonal}
          months={bd.monthsCovered}
          accent="#B45309"
        />
        {businessEnabled && (
          <BucketCard
            title="משתנות · עסקי"
            icon="campaign"
            bucket={bd.buckets.variableBusiness}
            months={bd.monthsCovered}
            accent="#9333EA"
          />
        )}
      </div>

      {/* Helpful hint when business is gated off */}
      {!businessEnabled && (
        <div
          className="flex items-start gap-2 rounded-xl px-4 py-3 text-[12px]"
          style={{ background: "#FAFAF7", border: "1px solid #E5E7EB" }}
        >
          <span className="material-symbols-outlined mt-0.5 text-[16px] text-verdant-emerald">
            tips_and_updates
          </span>
          <span className="text-verdant-ink">
            עמודות "עסקי" יופיעו כאן אוטומטית כשבן/בת זוג מסומנים כעצמאי/ת בשאלון
            המיפוי. כל תנועה ניתנת להגדרה כעסקית ידנית דרך{" "}
            <Link href="/files" className="text-verdant-emerald underline">
              תור הפענוח
            </Link>
            .
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */

function formatPeriod(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", { month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function KpiCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  return (
    <div className="card-pad flex flex-col items-center gap-1 text-center">
      <span className="material-symbols-outlined text-[20px]" style={{ color }}>
        {icon}
      </span>
      <div className="tabular text-xl font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-verdant-muted">
        {label}
      </div>
    </div>
  );
}

function SummaryStrip({
  label,
  value,
  totalCount,
  accent,
  hint,
}: {
  label: string;
  value: number;
  totalCount: number;
  accent: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "#FAFAF7", border: `1px solid ${accent}33` }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-verdant-muted">
          {label}
        </span>
        <span className="tabular text-lg font-extrabold" style={{ color: accent }}>
          {fmtILS(value)}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-verdant-muted">
        {totalCount.toLocaleString("he-IL")} תנועות · {hint}
      </div>
    </div>
  );
}

function BucketCard({
  title,
  icon,
  bucket,
  months,
  accent,
}: {
  title: string;
  icon: string;
  bucket: BucketBreakdown;
  months: number;
  accent: string;
}) {
  const monthlyExpense = bucket.expenseTotal / months;
  const positiveCategories = bucket.categories.filter((c) => c.amount > 0);

  return (
    <div className="card-pad" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: accent }}>
            {icon}
          </span>
          <h3 className="text-sm font-extrabold text-verdant-ink">{title}</h3>
        </div>
        <span className="tabular text-base font-extrabold" style={{ color: accent }}>
          {fmtILS(monthlyExpense)}/ח׳
        </span>
      </div>
      <div className="mb-3 text-[10px] text-verdant-muted">
        {bucket.txCount} תנועות · סה״כ {fmtILS(bucket.expenseTotal)} ל-{months} חודשים
      </div>

      {positiveCategories.length === 0 ? (
        <div className="py-3 text-center text-xs text-verdant-muted">
          אין הוצאות בקטגוריה זו עדיין
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "#E5E7EB" }}>
          {positiveCategories.slice(0, 8).map((cat) => {
            const pct = bucket.expenseTotal > 0 ? (cat.amount / bucket.expenseTotal) * 100 : 0;
            return (
              <div key={cat.key} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-verdant-ink">{cat.label}</span>
                  <span className="text-[10px] text-verdant-muted">{cat.count}</span>
                </div>
                <div className="flex items-center gap-2 text-verdant-muted">
                  <span className="tabular">{fmtILS(cat.amount)}</span>
                  <span className="text-[10px]">({Math.round(pct)}%)</span>
                </div>
              </div>
            );
          })}
          {positiveCategories.length > 8 && (
            <div className="pt-2 text-center text-[10px] text-verdant-muted">
              ועוד {positiveCategories.length - 8} קטגוריות
            </div>
          )}
        </div>
      )}
    </div>
  );
}
