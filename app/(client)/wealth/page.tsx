"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { fmtILS } from "@/lib/format";
import { demoAssets, demoLiabilities, demoInstruments } from "@/lib/stub-data";
import type { FinancialInstrument } from "@/lib/stub-data";
import { getDebtAsLiabilities, loadDebtData, type LiabilitySummaryRow } from "@/lib/debt-store";

const ASSET_GROUPS: Record<string, { label: string; icon: string; color: string; href: string }> = {
  liquid:      { label: "נזילים · עו״ש וחסכון",   icon: "account_balance_wallet", color: "#10b981", href: "/cashflow-map" },
  investments: { label: "השקעות ותיקי נייע",      icon: "candlestick_chart",      color: "#0a7a4a", href: "/investments" },
  pension:     { label: "פנסיוני ארוך טווח",      icon: "elderly",                color: "#1a6b42", href: "/retirement" },
  realestate:  { label: "נדל״ן",                  icon: "home",                   color: "#125c38", href: "" },
  other:       { label: "רכב ונכסים נוספים",      icon: "directions_car",         color: "#58e1b0", href: "" },
};
const LIAB_GROUPS: Record<string, { label: string; icon: string; color: string; href: string }> = {
  mortgage: { label: "משכנתא",         icon: "home_work",   color: "#7f1d1d", href: "/debt" },
  loans:    { label: "הלוואות",        icon: "credit_score", color: "#b91c1c", href: "/debt" },
  cc:       { label: "אשראי ותשלומים", icon: "credit_card",  color: "#ef4444", href: "/debt" },
};

export default function WealthPage() {
  // Load real debt data from SSOT
  const [realLiabilities, setRealLiabilities] = useState<LiabilitySummaryRow[]>([]);
  useEffect(() => {
    setRealLiabilities(getDebtAsLiabilities());
    const handler = () => setRealLiabilities(getDebtAsLiabilities());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const liabilities = useMemo(() => {
    if (realLiabilities.length > 0) return realLiabilities;
    return demoLiabilities.map(l => ({
      id: l.id, name: l.name,
      liability_group: l.liability_group as "mortgage" | "loans" | "cc",
      balance: l.balance, rate_pct: l.rate_pct, monthly_payment: l.monthly_payment,
    }));
  }, [realLiabilities]);

  const totalAssets = demoAssets.reduce((s, a) => s + a.balance, 0);
  const totalLiab  = liabilities.reduce((s, l) => s + l.balance, 0);
  const netWorth = totalAssets - totalLiab;
  const ratio = totalAssets > 0 ? Math.round((totalLiab / totalAssets) * 100) : 0;

  // Group assets by category
  const assetGroups = useMemo(() => {
    const groups: Record<string, { total: number; items: typeof demoAssets }> = {};
    for (const a of demoAssets) {
      if (!groups[a.asset_group]) groups[a.asset_group] = { total: 0, items: [] };
      groups[a.asset_group].total += a.balance;
      groups[a.asset_group].items.push(a);
    }
    return groups;
  }, []);

  // Group liabilities by category
  const liabGroups = useMemo(() => {
    const groups: Record<string, { total: number; items: LiabilitySummaryRow[] }> = {};
    for (const l of liabilities) {
      if (!groups[l.liability_group]) groups[l.liability_group] = { total: 0, items: [] };
      groups[l.liability_group].total += l.balance;
      groups[l.liability_group].items.push(l);
    }
    return groups;
  }, [liabilities]);

  // Donut slices
  const assetSlices = Object.entries(ASSET_GROUPS)
    .map(([key, meta]) => ({
      label: meta.label.split("·")[0].trim(),
      pct: Math.round(((assetGroups[key]?.total || 0) / totalAssets) * 100),
      color: meta.color,
    }))
    .filter(s => s.pct > 0);
  const liabSlices = Object.entries(LIAB_GROUPS)
    .map(([key, meta]) => ({
      label: meta.label,
      pct: totalLiab > 0 ? Math.round(((liabGroups[key]?.total || 0) / totalLiab) * 100) : 0,
      color: meta.color,
    }))
    .filter(s => s.pct > 0);

  // Advisor insights based on data
  const insights: { icon: string; title: string; text: string; severity: "info" | "warn" | "good" }[] = [];
  if (ratio > 40) {
    insights.push({ icon: "warning", title: "יחס חוב גבוה", text: `יחס חוב/נכס ${ratio}% — גבוה מ-40%. שקלו מיחזור או צמצום התחייבויות.`, severity: "warn" });
  } else {
    insights.push({ icon: "verified", title: "יחס חוב בריא", text: `יחס חוב/נכס ${ratio}% — בטווח הבריא (מתחת ל-40%).`, severity: "good" });
  }
  const liquidTotal = assetGroups["liquid"]?.total || 0;
  const monthlyExpense = 27000; // TODO: from real cashflow
  const emergencyMonths = liquidTotal > 0 ? (liquidTotal / monthlyExpense) : 0;
  if (emergencyMonths < 3) {
    insights.push({ icon: "savings", title: "קרן חירום נמוכה", text: `${emergencyMonths.toFixed(1)} חודשי הוצאה בנזילות — מומלץ 3-6 חודשים.`, severity: "warn" });
  }
  const pensionPct = totalAssets > 0 ? Math.round(((assetGroups["pension"]?.total || 0) / totalAssets) * 100) : 0;
  if (pensionPct > 40) {
    insights.push({ icon: "lock", title: "ריכוז פנסיוני גבוה", text: `${pensionPct}% מהנכסים נעולים בפנסיה — שקלו גיוון לנכסים נזילים יותר.`, severity: "info" });
  }

  const severityColors = { warn: "#b91c1c", good: "#0a7a4a", info: "#1d4ed8" };
  const severityBg = { warn: "#fef2f2", good: "#f0fdf4", info: "#eff6ff" };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Wealth Map · הון עצמי"
        title="מפת נכסים"
        description="תמונת על של הנכסים, ההתחייבויות וההון העצמי שלכם"
      />

      {/* ===== Advisor Insights ===== */}
      {insights.length > 0 && (
        <section className="space-y-2 mb-6">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: severityBg[ins.severity], border: `1px solid ${severityColors[ins.severity]}22` }}>
              <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: severityColors[ins.severity] }}>{ins.icon}</span>
              <div>
                <div className="text-sm font-extrabold" style={{ color: severityColors[ins.severity] }}>{ins.title}</div>
                <div className="text-xs text-verdant-muted mt-0.5">{ins.text}</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ===== KPI Bento ===== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">סך נכסים</div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-emerald tabular">{fmtILS(totalAssets)}</div>
        </div>
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">סך התחייבויות</div>
          <div className="text-xl md:text-2xl font-extrabold tabular" style={{ color: "#b91c1c" }}>{fmtILS(totalLiab)}</div>
        </div>
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">הון עצמי (Net Worth)</div>
          <div className="text-xl md:text-2xl font-extrabold text-verdant-ink tabular">{fmtILS(netWorth)}</div>
        </div>
        <div className="v-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">יחס חוב/נכס</div>
          <div className="text-xl md:text-2xl font-extrabold tabular" style={{ color: ratio > 40 ? "#b91c1c" : "#0a7a4a" }}>{ratio}%</div>
          <div className="text-[10px] text-verdant-muted mt-0.5">בריא: מתחת ל-40%</div>
        </div>
      </section>

      {/* ===== Distribution donuts ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">פיזור נכסים</div>
          <AssetDonut slices={assetSlices} />
        </div>
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-3">פיזור התחייבויות</div>
          <AssetDonut slices={liabSlices} />
        </div>
      </section>

      {/* ===== Assets Summary Cards — Drill Down ===== */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">account_balance</span>
          <h2 className="text-sm font-extrabold text-verdant-ink">נכסים לפי קטגוריה</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ASSET_GROUPS).map(([key, meta]) => {
            const group = assetGroups[key];
            if (!group) return null;
            const pct = Math.round((group.total / totalAssets) * 100);
            const hasLink = meta.href !== "";
            const inner = (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.color + "15" }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>{meta.icon}</span>
                    </div>
                    <div className="text-sm font-extrabold text-verdant-ink">{meta.label}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.color + "15", color: meta.color }}>
                    {pct}%
                  </span>
                </div>
                <div className="text-xl font-extrabold tabular" style={{ color: meta.color }}>{fmtILS(group.total)}</div>
                <div className="text-[11px] text-verdant-muted mt-2">
                  {group.items.length} פריטים
                  {group.items.length <= 3 && (
                    <span> · {group.items.map(a => a.name).join(", ")}</span>
                  )}
                </div>
                {hasLink && (
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t v-divider text-[10px] font-bold" style={{ color: meta.color }}>
                    <span>צפה בפירוט</span>
                    <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                  </div>
                )}
              </>
            );
            return hasLink ? (
              <Link key={key} href={meta.href as any} className="v-card p-5 flex flex-col justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                {inner}
              </Link>
            ) : (
              <div key={key} className="v-card p-5 flex flex-col justify-between">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Liabilities Summary Cards — Drill Down ===== */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#b91c1c" }}>credit_score</span>
          <h2 className="text-sm font-extrabold text-verdant-ink">התחייבויות לפי קטגוריה</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(LIAB_GROUPS).map(([key, meta]) => {
            const group = liabGroups[key];
            if (!group) return null;
            const pct = totalLiab > 0 ? Math.round((group.total / totalLiab) * 100) : 0;
            const totalMonthly = group.items.reduce((s, l) => s + l.monthly_payment, 0);
            return (
              <Link
                key={key}
                href={meta.href as any}
                className="v-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.color + "15" }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>{meta.icon}</span>
                    </div>
                    <div className="text-sm font-extrabold text-verdant-ink">{meta.label}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.color + "15", color: meta.color }}>
                    {pct}%
                  </span>
                </div>
                <div className="text-xl font-extrabold tabular" style={{ color: meta.color }}>{fmtILS(group.total)}</div>
                <div className="text-[11px] text-verdant-muted mt-2">
                  {group.items.length} פריטים · החזר חודשי: {fmtILS(totalMonthly)}
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t v-divider text-[10px] font-bold" style={{ color: meta.color }}>
                  <span>צפה בפירוט</span>
                  <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ===== Asset Vault — Financial Infrastructure ===== */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">vault</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-0.5">The Asset Vault</div>
            <h2 className="text-sm font-extrabold text-verdant-ink">תשתית פיננסית — כל המכשירים</h2>
          </div>
        </div>
        <div className="space-y-3">
          {/* Group by type */}
          {(["bank", "investment", "credit_card"] as const).map(type => {
            const group = demoInstruments.filter(i => i.type === type);
            if (group.length === 0) return null;
            const typeLabel = type === "bank" ? "חשבונות בנק" : type === "investment" ? "חשבונות השקעות" : "כרטיסי אשראי";
            const typeIcon = type === "bank" ? "account_balance" : type === "investment" ? "candlestick_chart" : "credit_card";
            const typeColor = type === "bank" ? "#0a7a4a" : type === "investment" ? "#1a6b42" : "#8b5cf6";
            return (
              <div key={type} className="v-card overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-2" style={{ background: "#f4f7ed" }}>
                  <span className="material-symbols-outlined text-[16px]" style={{ color: typeColor }}>{typeIcon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">{typeLabel}</span>
                  <span className="text-[10px] font-bold text-verdant-muted">({group.length})</span>
                </div>
                {group.map(inst => {
                  const daysAgo = inst.lastUpdated ? Math.floor((Date.now() - new Date(inst.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 999;
                  // 3-tier freshness: green (≤30d), yellow (31-60d, forecast-based), red (>60d, needs manual update)
                  const freshness: "fresh" | "forecast" | "stale" = daysAgo <= 30 ? "fresh" : daysAgo <= 60 ? "forecast" : "stale";
                  const freshnessColor = freshness === "fresh" ? "#10b981" : freshness === "forecast" ? "#f59e0b" : "#ef4444";
                  const freshnessLabel = freshness === "fresh" ? "מעודכן" : freshness === "forecast" ? "מבוסס תחזית" : "דורש עדכון";
                  const freshnessBg = freshness === "fresh" ? "#dcfce7" : freshness === "forecast" ? "#fef3c7" : "#fef2f2";
                  const freshnessBorder = freshness === "fresh" ? "#86efac" : freshness === "forecast" ? "#fcd34d" : "#fca5a5";
                  const freshnessTextColor = freshness === "fresh" ? "#166534" : freshness === "forecast" ? "#92400e" : "#991b1b";
                  return (
                    <div key={inst.id} className="px-5 py-4 border-b v-divider flex items-center justify-between hover:bg-[#f9faf2] transition-colors">
                      <div className="flex items-center gap-4">
                        {/* Freshness indicator dot */}
                        <div className="w-3 h-3 rounded-full flex-shrink-0 relative" style={{ background: freshnessColor }}>
                          {freshness === "fresh" && <div className="absolute inset-0 rounded-full animate-ping" style={{ background: freshnessColor, opacity: 0.3 }} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-verdant-ink">{inst.name}</span>
                            {inst.last4 && <span className="text-[10px] text-verdant-muted font-bold">****{inst.last4}</span>}
                          </div>
                          <div className="text-[11px] text-verdant-muted mt-0.5">
                            {inst.institution}
                            {inst.accountNumber && <span> · חשבון {inst.accountNumber}</span>}
                            {inst.lastUpdated && (
                              <span> · עודכן {new Date(inst.lastUpdated).toLocaleDateString("he-IL")} ({daysAgo === 0 ? "היום" : daysAgo === 1 ? "אתמול" : `לפני ${daysAgo} ימים`})</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {inst.balance != null && (
                          <div className="text-sm font-extrabold text-verdant-ink tabular">{fmtILS(inst.balance)}</div>
                        )}
                        {/* Freshness badge + action */}
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:shadow-md"
                          style={{
                            background: freshnessBg,
                            color: freshnessTextColor,
                            border: `1px solid ${freshnessBorder}`,
                          }}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {freshness === "fresh" ? "check_circle" : freshness === "forecast" ? "schedule" : "sync_problem"}
                          </span>
                          {freshnessLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Net Worth Insight ===== */}
      <div className="rounded-2xl p-5 md:p-6" style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)", color: "#fff" }}>
        <div className="flex items-start gap-3 md:gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(88,225,176,0.2)" }}>
            <span className="material-symbols-outlined" style={{ color: "#58e1b0" }}>insights</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2" style={{ color: "#58e1b0" }}>סיכום הון עצמי</div>
            <h3 className="text-base md:text-lg font-extrabold mb-2">
              הון עצמי: {fmtILS(netWorth)} · יחס חוב {ratio}%
            </h3>
            <p className="text-xs md:text-sm opacity-90 leading-relaxed">
              {ratio <= 40
                ? "המבנה הפיננסי שלכם מאוזן. המשיכו לבנות הון עצמי דרך חיסכון שוטף והפחתת התחייבויות."
                : "יחס החוב גבוה מהמומלץ. שקלו להקדים תשלומי הלוואות או למחזר את המשכנתא בעמוד ההלוואות."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
