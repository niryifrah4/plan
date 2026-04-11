"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fmtILS, fmtPct } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { demoAssets, demoCashflow, demoGoals } from "@/lib/stub-data";
import { getTotalLiabilities } from "@/lib/debt-store";
import { loadAssumptions, savingsRatio } from "@/lib/assumptions";
import type { Assumptions } from "@/lib/assumptions";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { useClient } from "@/lib/client-context";

const TRACK_COLOR: Record<string, string> = { on: "#0a7a4a", behind: "#f59e0b", at_risk: "#b91c1c" };
const TRACK_LABEL: Record<string, string> = { on: "בדרך", behind: "בפיגור", at_risk: "בסיכון" };
const GOAL_ICONS: Record<string, string> = {
  "קרן חירום": "savings", "חינוך": "school", "חינוך ילדים": "school",
  "רכב": "directions_car", "דירה": "home", "פרישה": "elderly",
  "פרישה מוקדמת": "elderly", "חתונה": "favorite", "חופשה": "flight_takeoff",
  "עסק": "storefront", "default": "flag",
};

function getGoalIcon(name: string): string {
  for (const [key, icon] of Object.entries(GOAL_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return GOAL_ICONS.default;
}

/** Monthly check-in storage key */
const CHECKIN_KEY = "verdant:monthly_checkin";

export default function DashboardPage() {
  const { familyName, loading } = useClient();
  const cashflow = demoCashflow;
  const assets = demoAssets;

  const [realLiab, setRealLiab] = useState(0);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinDismissed, setCheckinDismissed] = useState(false);

  useEffect(() => {
    setRealLiab(getTotalLiabilities());
    setAssumptions(loadAssumptions());
    const handler = () => { setRealLiab(getTotalLiabilities()); setAssumptions(loadAssumptions()); };
    window.addEventListener("storage", handler);
    window.addEventListener("verdant:assumptions", handler);
    return () => { window.removeEventListener("storage", handler); window.removeEventListener("verdant:assumptions", handler); };
  }, []);

  // Monthly check-in: show on 10th+ of month if not dismissed this month
  useEffect(() => {
    const now = new Date();
    const day = now.getDate();
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    try {
      const dismissed = localStorage.getItem(CHECKIN_KEY);
      if (day >= 10 && dismissed !== monthKey) {
        setShowCheckin(true);
      }
    } catch {}
  }, []);

  const dismissCheckin = () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    localStorage.setItem(CHECKIN_KEY, monthKey);
    setShowCheckin(false);
    setCheckinDismissed(true);
  };

  const totalAssets = assets.reduce((a, x) => a + x.balance, 0);
  const totalLiabilities = realLiab > 0 ? realLiab : 420_000;
  const netWorthVal = totalAssets - totalLiabilities;
  const latestGap = cashflow[0]?.cashflow_gap ?? 0;
  const latestIncome = cashflow[0]?.income_total ?? 1;

  // Savings Rate = FreeCash / TotalIncome × 100
  const savingsRate = latestIncome > 0 ? (latestGap / latestIncome) * 100 : 0;
  const savingsLabel = savingsRate >= 20 ? "מצוין" : savingsRate >= 10 ? "טוב" : "דורש שיפור";
  const savingsLabelColor = savingsRate >= 20 ? "#0a7a4a" : savingsRate >= 10 ? "#b45309" : "#b91c1c";

  // ─── Daily Pulse: Safe to Spend + Goal Compliance ───
  const latestExpense = cashflow[0]?.expense_total ?? 0;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const today_date = new Date().getDate();
  const daysLeft = Math.max(1, daysInMonth - today_date + 1);
  // Safe to Spend = monthly income - (fixed commitments) - (goal contributions) - expenses so far
  // Simplified: assume expense_total tracks month-to-date burn, so remaining = income - expense - savings target
  const monthlyBudget = Math.max(0, latestIncome - latestExpense);
  const safeToSpend = Math.round(monthlyBudget);
  const safePerDay = Math.round(safeToSpend / daysLeft);

  // Allocation slices for donut
  const allocationSlices = useMemo(() => {
    const groups: Record<string, { label: string; color: string; total: number }> = {
      liquid: { label: "נזיל", color: "#0a7a4a", total: 0 },
      investments: { label: "השקעות", color: "#012d1d", total: 0 },
      pension: { label: "פנסיוני", color: "#1e6b3a", total: 0 },
      realestate: { label: "נדל״ן", color: "#58e1b0", total: 0 },
    };
    assets.forEach(a => { if (groups[a.asset_group]) groups[a.asset_group].total += a.balance; });
    return Object.values(groups)
      .filter(g => g.total > 0)
      .map(g => ({ label: g.label, pct: Math.round((g.total / totalAssets) * 100), color: g.color }));
  }, [assets, totalAssets]);

  // Pension forecast
  const pensionForecast = useMemo(() => {
    const a = assumptions || loadAssumptions();
    const pensionBalance = assets.filter(x => x.asset_group === "pension").reduce((s, x) => s + x.balance, 0);
    const yearsToRetirement = Math.max(0, a.retirementAge - a.currentAge);
    const pensionAtRetirement = futureValue(pensionBalance, 0, a.expectedReturnPension - a.managementFeePension, yearsToRetirement);
    const monthlyPension = Math.round(pensionAtRetirement * 0.04 / 12);
    const replacementRate = a.monthlyIncome > 0 ? monthlyPension / a.monthlyIncome : 0;
    return { monthlyPension, replacementRate };
  }, [assumptions, assets]);

  // Load goals for summary — client-side only to avoid hydration mismatch
  const [goalsSummary, setGoalsSummary] = useState(() =>
    demoGoals.map(g => ({
      id: g.id, name: g.name, targetAmount: g.target_amount,
      targetDate: g.target_date, track: g.track,
    }))
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem("verdant:vision_goals");
      if (raw) {
        const goals = JSON.parse(raw);
        setGoalsSummary(goals.map((g: any) => ({
          id: g.id, name: g.name, targetAmount: g.targetAmount,
          targetDate: g.targetDate,
          track: g.priority === "high" ? "at_risk" : g.priority === "medium" ? "behind" : "on",
        })));
      }
    } catch {}
    const handler = () => {
      try {
        const raw = localStorage.getItem("verdant:vision_goals");
        if (raw) {
          const goals = JSON.parse(raw);
          setGoalsSummary(goals.map((g: any) => ({
            id: g.id, name: g.name, targetAmount: g.targetAmount,
            targetDate: g.targetDate,
            track: g.priority === "high" ? "at_risk" : g.priority === "medium" ? "behind" : "on",
          })));
        }
      } catch {}
    };
    window.addEventListener("storage", handler);
    window.addEventListener("verdant:goals:updated", handler);
    return () => { window.removeEventListener("storage", handler); window.removeEventListener("verdant:goals:updated", handler); };
  }, []);

  // ─── Holistic growth trajectory: March 2026 → age 100 ───
  const trajectory = useMemo(() => {
    const a = assumptions || loadAssumptions();
    const startAge = a.currentAge;
    const startYear = 2026;
    const startMonth = 3;
    const points: { age: number; year: number; month: number; label: string; liquid: number; pension: number; realestate: number; total: number }[] = [];

    const liquid = assets.filter(x => x.asset_group === "liquid" || x.asset_group === "investments").reduce((s, x) => s + x.balance, 0);
    const pension = assets.filter(x => x.asset_group === "pension").reduce((s, x) => s + x.balance, 0);
    const realestate = assets.filter(x => x.asset_group === "realestate").reduce((s, x) => s + x.balance, 0);
    const salaryGrowth = a.salaryGrowthRate ?? 0.03;

    for (let age = startAge; age <= 100; age++) {
      const yearsIn = age - startAge;
      const yr = startYear + yearsIn;
      const reVal = realestate * Math.pow(1.03, yearsIn);
      const penVal = age <= a.retirementAge
        ? futureValue(pension, 0, a.expectedReturnPension - a.managementFeePension, yearsIn)
        : pension * Math.pow(1 + 0.02, yearsIn - (a.retirementAge - startAge));
      const growingMonthly = a.monthlyInvestment * Math.pow(1 + salaryGrowth, yearsIn);
      const liqVal = age <= a.retirementAge
        ? futureValue(liquid, growingMonthly, a.expectedReturnInvest - a.managementFeeInvest, yearsIn)
        : liquid * Math.pow(1.03, yearsIn);

      points.push({
        age, year: yr, month: startMonth,
        label: age % 5 === 0 || age === startAge || age === a.retirementAge ? `${yr}` : "",
        liquid: liqVal, pension: penVal, realestate: reVal,
        total: liqVal + penVal + reVal - totalLiabilities * Math.max(0, 1 - yearsIn * 0.05),
      });
    }
    return points;
  }, [assumptions, assets, totalLiabilities]);

  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Predicted balance for check-in
  const predictedBalance = useMemo(() => {
    const liquid = assets.filter(x => x.asset_group === "liquid").reduce((s, x) => s + x.balance, 0);
    return liquid + latestGap; // simple projection: last liquid + this month's gap
  }, [assets, latestGap]);

  // Chart dimensions
  const CW = 700, CH = 200;
  const maxNW = Math.max(...trajectory.map(t => t.total), 1);

  return (
    <div className="max-w-5xl mx-auto" style={{ fontFamily: "'Assistant', sans-serif" }}>

      {/* ═══════ Monthly Check-in Popup ═══════ */}
      {showCheckin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(1,45,29,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" style={{ background: "#fff", border: "2px solid #0a7a4a30" }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
                <span className="material-symbols-outlined text-[22px] text-white">fact_check</span>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-verdant-ink">בדיקה חודשית</h3>
                <p className="text-[11px] text-verdant-muted font-bold">Monthly Check-in · עדכון יתרות</p>
              </div>
            </div>

            <div className="rounded-xl p-5 mb-6" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
              <div className="text-[11px] font-bold text-verdant-muted mb-2">יתרת עו״ש צפויה לפי התחזית:</div>
              <div className="text-3xl font-extrabold tabular text-verdant-ink mb-3">{fmtILS(Math.round(predictedBalance))}</div>
              <div className="text-[12px] font-bold text-verdant-ink">האם היתרה בפועל תואמת?</div>
            </div>

            <div className="flex gap-3">
              <button onClick={dismissCheckin}
                className="flex-1 text-[12px] font-bold py-3 rounded-xl text-white transition-shadow hover:shadow-md"
                style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
                כן, תואם
              </button>
              <Link href={"/wealth" as any} onClick={dismissCheckin}
                className="flex-1 text-[12px] font-bold py-3 rounded-xl text-center transition-shadow hover:shadow-md"
                style={{ background: "#f59e0b15", color: "#b45309", border: "1px solid #f59e0b30" }}>
                עדכן יתרות
              </Link>
              <button onClick={dismissCheckin}
                className="text-[12px] font-bold py-3 px-4 rounded-xl text-verdant-muted hover:bg-verdant-bg transition-colors"
                style={{ background: "#eef2e8" }}>
                דלג
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Header ═══════ */}
      <header className="mb-10 pb-8 border-b v-divider">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-verdant-muted font-bold mb-3">
              The Cockpit · לוח בקרה
            </div>
            <h1 className="text-4xl font-extrabold text-verdant-ink tracking-tight leading-tight">
              {loading ? "טוען..." : `שלום ${familyName}`}
            </h1>
            <p className="text-sm text-verdant-muted mt-2">{today}</p>
          </div>
        </div>
      </header>

      {/* ═══════ Daily Pulse — 3 Headline Metrics ═══════ */}
      {(() => {
        const compliance = goalsSummary.length
          ? Math.round((goalsSummary.filter((g: any) => g.track === "on").length / goalsSummary.length) * 100)
          : 100;

        // Time to financial freedom: find the first trajectory point where total >= 300 × monthly expense
        const a = assumptions || loadAssumptions();
        const freedomNumber = (a.monthlyIncome * 0.7) * 300; // 70% replacement × 300 months rule
        const freedomPoint = trajectory.find(p => p.total >= freedomNumber);
        const freedomAge = freedomPoint?.age ?? (a.retirementAge || 67);
        const yearsToFreedom = Math.max(0, freedomAge - a.currentAge);

        const onTrack = compliance >= 70 && savingsRate >= 10 && safeToSpend > 0;
        const pulseColor = onTrack ? "#0a7a4a" : "#b45309";
        const pulseBg = onTrack
          ? "linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%)"
          : "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)";
        const pulseIcon = onTrack ? "favorite" : "warning";
        const pulseLabel = onTrack ? "במסלול" : "דורש תשומת לב";
        return (
          <section className="mb-12 rounded-[18px] p-8 relative overflow-hidden"
            style={{ background: pulseBg, border: `1.5px solid ${pulseColor}30`, boxShadow: `0 4px 20px ${pulseColor}12` }}>
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: `linear-gradient(90deg, ${pulseColor}, ${pulseColor}80)` }} />
            <div className="flex items-start justify-between mb-7">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: pulseColor }}>monitoring</span>
                  <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: pulseColor }}>Daily Pulse · דופק יומי</div>
                </div>
                <p className="text-[12px] font-bold text-verdant-muted">ניהול חיים ללא מאמץ — שלושת המספרים שקובעים את הכיוון</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: `${pulseColor}18` }}>
                <span className="material-symbols-outlined text-[16px]" style={{ color: pulseColor }}>{pulseIcon}</span>
                <span className="text-[12px] font-extrabold" style={{ color: pulseColor }}>{pulseLabel}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* 1 — Safe to Spend */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-2">בטוח להוציא החודש</div>
                <div className="text-4xl font-extrabold tabular leading-none" style={{ color: pulseColor }}>{fmtILS(safeToSpend)}</div>
                <div className="text-[11px] font-bold text-verdant-muted mt-3">
                  ≈ {fmtILS(safePerDay)} ליום · נותרו {daysLeft} ימים
                </div>
              </div>

              {/* 2 — Savings Rate */}
              <div className="border-r border-l px-6" style={{ borderColor: `${pulseColor}20` }}>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-2">אחוז חיסכון</div>
                <div className="flex items-baseline gap-2 leading-none">
                  <div className="text-4xl font-extrabold tabular" style={{ color: savingsLabelColor }}>{savingsRate.toFixed(1)}%</div>
                  <span className="text-[11px] font-bold" style={{ color: savingsLabelColor }}>{savingsLabel}</span>
                </div>
                <div className="w-full h-1.5 rounded-full mt-4" style={{ background: "#ffffff80" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${Math.min(100, Math.max(0, savingsRate) * 2.5)}%`,
                    background: `linear-gradient(90deg, ${savingsLabelColor}, ${savingsLabelColor}cc)`,
                  }} />
                </div>
              </div>

              {/* 3 — Time to Financial Freedom */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-2">זמן לחופש כלכלי</div>
                <div className="flex items-baseline gap-2 leading-none">
                  <div className="text-4xl font-extrabold tabular" style={{ color: pulseColor }}>
                    {yearsToFreedom > 50 ? "—" : yearsToFreedom}
                  </div>
                  <span className="text-[13px] font-bold text-verdant-muted">
                    {yearsToFreedom > 50 ? "לא ניתן בתכנון הנוכחי" : "שנים"}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-verdant-muted mt-3">
                  {yearsToFreedom > 50 ? "הגדל השקעה חודשית" : `בגיל ${freedomAge} · מספר החופש ${fmtILS(freedomNumber)}`}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ═══════ Asset Allocation Donut + 4 KPIs ═══════ */}
      <section className="grid grid-cols-[220px_1fr] gap-10 mb-14">
        {/* Donut */}
        <div className="v-card p-7">
          <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-5">אלוקציית נכסים</div>
          <AssetDonut slices={allocationSlices} />
        </div>

        {/* 4 KPIs — 2×2 grid */}
        <div className="grid grid-cols-2 gap-5">
          {/* 1 — Net Worth */}
          <Link href={"/wealth" as any} className="v-card p-7 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col justify-between">
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-4">שווי נקי</div>
            <div>
              <div className="text-3xl font-extrabold text-verdant-ink tabular mb-2">{fmtILS(netWorthVal)}</div>
              <div className="text-[10px] text-verdant-muted font-bold">נכסים {fmtILS(totalAssets)} · התחייבויות {fmtILS(totalLiabilities)}</div>
            </div>
          </Link>

          {/* 2 — Free Cashflow */}
          <Link href={"/cashflow-map" as any} className="v-card p-7 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col justify-between">
            <div className="text-[10px] uppercase tracking-[0.15em] text-verdant-muted font-bold mb-4">תזרים פנוי חודשי</div>
            <div>
              <div className="text-3xl font-extrabold tabular mb-2" style={{ color: latestGap >= 0 ? "#0a7a4a" : "#b91c1c" }}>{fmtILS(latestGap)}</div>
              <div className="text-[10px] text-verdant-muted font-bold">חודש נוכחי</div>
            </div>
          </Link>

          {/* 3 — Pension Forecast (dark) */}
          <div className="rounded-[14px] p-7 flex flex-col justify-between" style={{ background: "#012d1d", color: "#fff" }}>
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-4" style={{ color: "#58e1b0" }}>קצבה חזויה בפרישה</div>
            <div>
              <div className="text-3xl font-extrabold tabular mb-2">{fmtILS(pensionForecast.monthlyPension)}</div>
              <div className="text-[10px] opacity-60 mb-3">לחודש · גיל {assumptions?.retirementAge || 67}</div>
              <div className="flex items-center justify-between text-[10px] mb-1.5">
                <span className="opacity-60">שיעור החלפה</span>
                <span className="font-bold" style={{ color: "#58e1b0" }}>{Math.round(pensionForecast.replacementRate * 100)}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(pensionForecast.replacementRate * 100))}%`, background: "#58e1b0" }} />
              </div>
            </div>
          </div>

          {/* 4 — Savings Rate (prominent focus metric) */}
          <div className="rounded-[14px] p-7 flex flex-col justify-between relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%)", border: "1.5px solid #0a7a4a30", boxShadow: "0 2px 12px rgba(10,122,74,0.08)" }}>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg,#58e1b0,#0a7a4a)" }} />
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ color: "#0a7a4a" }}>אחוז חיסכון חודשי · המדד המרכזי</div>
              <span className="material-symbols-outlined text-[16px]" style={{ color: "#0a7a4a" }}>savings</span>
            </div>
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <div className="text-4xl font-extrabold tabular" style={{ color: savingsLabelColor }}>{savingsRate.toFixed(1)}%</div>
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                  style={{ background: `${savingsLabelColor}18`, color: savingsLabelColor }}>
                  {savingsLabel}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full mt-2" style={{ background: "#ffffff80" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${Math.min(100, Math.max(0, savingsRate) * 2.5)}%`,
                  background: `linear-gradient(90deg, ${savingsLabelColor}, ${savingsLabelColor}cc)`,
                }} />
              </div>
              <div className="flex justify-between text-[9px] font-bold text-verdant-muted mt-1.5">
                <span>0%</span>
                <span style={{ color: "#b45309" }}>10%</span>
                <span style={{ color: "#0a7a4a" }}>20%+</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ Holistic Growth Chart (Wealth Mountain) ═══════ */}
      <section className="v-card p-8 relative overflow-hidden mb-14">
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #0a7a4a 0%, transparent 60%)" }} />
        <div className="relative">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">Wealth Mountain · הר העושר</div>
              <h3 className="text-lg font-extrabold text-verdant-ink">תחזית צמיחה הוליסטית</h3>
            </div>
            <div className="flex gap-4 text-[10px] font-bold text-verdant-muted">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#58e1b0" }} />נדל&quot;ן</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#012d1d" }} />פנסיוני</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#0a7a4a" }} />נזיל + השקעות</span>
            </div>
          </div>

          <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ height: 220 }}>
            {/* Grid */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <line key={f} x1="0" x2={CW} y1={CH * (1 - f)} y2={CH * (1 - f)} stroke="#eef2e8" strokeWidth="1" />
            ))}

            {/* Stacked areas: RE base → pension → liquid top */}
            <path
              d={`M 0 ${CH} ` + trajectory.map((t, i) => {
                const x = (i / (trajectory.length - 1)) * CW;
                const y = CH - (t.realestate / maxNW) * (CH - 8);
                return `L ${x} ${y}`;
              }).join(" ") + ` L ${CW} ${CH} Z`}
              fill="#58e1b0" opacity="0.25"
            />
            <path
              d={`M 0 ${CH} ` + trajectory.map((t, i) => {
                const x = (i / (trajectory.length - 1)) * CW;
                const y = CH - ((t.realestate + t.pension) / maxNW) * (CH - 8);
                return `L ${x} ${y}`;
              }).join(" ") + ` L ${CW} ${CH} Z`}
              fill="#012d1d" opacity="0.2"
            />
            <path
              d={`M 0 ${CH} ` + trajectory.map((t, i) => {
                const x = (i / (trajectory.length - 1)) * CW;
                const y = CH - ((t.realestate + t.pension + t.liquid) / maxNW) * (CH - 8);
                return `L ${x} ${y}`;
              }).join(" ") + ` L ${CW} ${CH} Z`}
              fill="#0a7a4a" opacity="0.15"
            />
            {/* Total line */}
            <polyline
              points={trajectory.map((t, i) => {
                const x = (i / (trajectory.length - 1)) * CW;
                const y = CH - (t.total / maxNW) * (CH - 8);
                return `${x},${y}`;
              }).join(" ")}
              fill="none" stroke="#0a7a4a" strokeWidth="2.5" strokeLinecap="round"
              style={{ strokeDasharray: 2000, strokeDashoffset: 0, animation: "drawLine 2s ease-out forwards" }}
            />
            <style>{`@keyframes drawLine { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }`}</style>
            {/* Retirement age marker */}
            {assumptions && (() => {
              const retIdx = assumptions.retirementAge - assumptions.currentAge;
              if (retIdx > 0 && retIdx < trajectory.length) {
                const x = (retIdx / (trajectory.length - 1)) * CW;
                return (
                  <g>
                    <line x1={x} x2={x} y1="0" y2={CH} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth="1" opacity="0.5" />
                    <text x={x} y="12" textAnchor="middle" className="text-[8px]" fill="#f59e0b" fontWeight="bold">פרישה</text>
                  </g>
                );
              }
              return null;
            })()}
          </svg>
          <div className="flex justify-between text-[9px] text-verdant-muted font-bold mt-2 px-1">
            <span>מרץ 2026 (גיל {assumptions?.currentAge || 42})</span>
            <span>פרישה ({assumptions?.retirementAge || 67})</span>
            <span>גיל 80</span>
            <span>גיל 100</span>
          </div>
        </div>
      </section>

      {/* ═══════ Goals Summary ═══════ */}
      <section className="v-card p-8">
        <div className="flex items-center justify-between mb-7">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">Goals Overview · תקציר יעדים</div>
            <h3 className="text-lg font-extrabold text-verdant-ink">היעדים שלכם</h3>
          </div>
          <Link href={"/vision" as any} className="text-[11px] font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors hover:shadow-sm"
            style={{ background: "#0a7a4a10", color: "#0a7a4a" }}>
            צפה במפה המלאה
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          </Link>
        </div>

        <div className="space-y-4">
          {goalsSummary.map((g: any) => {
            const trackColor = TRACK_COLOR[g.track] || "#0a7a4a";
            const trackLabel = TRACK_LABEL[g.track] || "—";
            const icon = getGoalIcon(g.name);
            const dateStr = (() => {
              try {
                const d = new Date(g.targetDate);
                const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
                return `${months[d.getMonth()]} ${d.getFullYear()}`;
              } catch { return g.targetDate; }
            })();

            return (
              <div key={g.id} className="flex items-center gap-5 py-4 px-5 rounded-xl transition-colors hover:bg-verdant-bg"
                style={{ background: "#fff", border: "1px solid #eef2e8" }}>
                <span className="material-symbols-outlined text-[22px]" style={{ color: trackColor }}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-extrabold text-verdant-ink">{g.name}</div>
                  <div className="text-[11px] text-verdant-muted font-bold">{dateStr}</div>
                </div>
                <div className="text-[14px] font-extrabold tabular text-verdant-ink">{fmtILS(g.targetAmount)}</div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${trackColor}12`, color: trackColor }}>
                  {trackLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
