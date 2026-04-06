import Link from "next/link";
import { GrowthChart } from "@/components/charts/GrowthChart";
import { AssetDonut } from "@/components/charts/AssetDonut";
import { PensionCard } from "@/components/PensionCard";
import { fmtILS } from "@/lib/format";
import { healthScore } from "@/lib/tasks-engine";
import { isLowSafetyMargin, gapColor } from "@/lib/safety-margin";
import {
  demoCashflow, demoNetWorth, demoTasks, demoGoals, demoAssets,
} from "@/lib/stub-data";

export default function DashboardPage() {
  const cashflow  = demoCashflow;
  const netWorth  = demoNetWorth;
  const tasks     = demoTasks;
  const goals     = demoGoals;
  const assets    = demoAssets;

  const latestGap = cashflow[0]?.cashflow_gap ?? 0;
  const openTasks = tasks.filter((t) => t.status === "open");
  const highTasks = openTasks.filter((t) => t.severity === "high").length;
  const score     = healthScore(tasks);

  // Asset allocation from wealth data
  const totalAssets = assets.reduce((a, x) => a + x.balance, 0);
  const allocSlices = [
    { label: "נזיל",   pct: Math.round((assets.filter(a => a.asset_group === "liquid").reduce((s, a) => s + a.balance, 0) / totalAssets) * 100), color: "#10b981" },
    { label: "נדל\"ן", pct: Math.round((assets.filter(a => a.asset_group === "realestate").reduce((s, a) => s + a.balance, 0) / totalAssets) * 100), color: "#0a7a4a" },
    { label: "פנסיוני", pct: Math.round((assets.filter(a => a.asset_group === "pension").reduce((s, a) => s + a.balance, 0) / totalAssets) * 100), color: "#012d1d" },
    { label: "השקעות",  pct: Math.round((assets.filter(a => a.asset_group === "investments").reduce((s, a) => s + a.balance, 0) / totalAssets) * 100), color: "#1a6b42" },
  ].filter(s => s.pct > 0);

  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-6xl mx-auto">
      {/* ========== Header ========== */}
      <header className="mb-10 pb-8 border-b v-divider">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-verdant-muted font-bold mb-3">
              Executive Summary · תיק משפחתי
            </div>
            <h1 className="text-4xl font-extrabold text-verdant-ink tracking-tight leading-tight">
              שלום משפחת יפרח
            </h1>
            <p className="text-sm text-verdant-muted mt-2">{today}</p>
          </div>
        </div>
      </header>

      {/* ========== KPI Row — 3 cards ========== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10" style={{ alignItems: "stretch" }}>
        <Link
          href={"/cashflow-map" as any}
          className="v-card p-7 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
          style={{ minHeight: 168 }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">תזרים חודשי פנוי</div>
            <span className="material-symbols-outlined text-verdant-emerald text-[20px]">water_drop</span>
          </div>
          <div className="text-4xl font-extrabold tracking-tight" style={{ color: gapColor(latestGap) }}>{fmtILS(latestGap)}</div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t v-divider">
            {isLowSafetyMargin(latestGap) || latestGap < 0 ? (
              <span className="text-xs font-bold flex items-center gap-1" style={{ color: gapColor(latestGap) }}>
                <span className="material-symbols-outlined text-[14px]">warning</span>
                {latestGap < 0 ? "תזרים שלילי — גירעון" : "מרווח ביטחון נמוך"}
              </span>
            ) : (
              <span className="text-xs text-verdant-muted">ממוצע {cashflow.length} חודשים · ממאזן חי</span>
            )}
          </div>
        </Link>

        <Link
          href={"/wealth" as any}
          className="v-card p-7 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
          style={{ minHeight: 168 }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">שווי נקי נוכחי</div>
            <span className="material-symbols-outlined text-verdant-emerald text-[20px]">trending_up</span>
          </div>
          <div className="text-4xl font-extrabold text-verdant-ink tracking-tight">{fmtILS(netWorth.net_worth)}</div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t v-divider">
            <span className="text-xs text-verdant-muted">נכסים {fmtILS(netWorth.total_assets)} · התחייבויות {fmtILS(netWorth.total_liabilities)}</span>
          </div>
        </Link>

        <Link
          href={"/tasks" as any}
          className="v-card p-7 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
          style={{ minHeight: 168 }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">משימות פתוחות</div>
            <span className="material-symbols-outlined text-verdant-emerald text-[20px]">checklist</span>
          </div>
          <div className="text-4xl font-extrabold tracking-tight" style={{ color: highTasks > 0 ? "#b91c1c" : "#012d1d" }}>
            {openTasks.length}
          </div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t v-divider">
            <span className="text-xs text-verdant-muted">{highTasks} דחופות · ציון {score}</span>
          </div>
        </Link>
      </section>

      {/* ========== Strategic Charts: Growth + Donut ========== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
        {/* Growth chart — links to wealth */}
        <Link href={"/wealth" as any} className="v-card p-7 lg:col-span-2 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">צמיחה שנתית</div>
              <h3 className="text-lg font-extrabold text-verdant-ink">גידול הון לאורך זמן</h3>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="flex items-center gap-1.5 text-verdant-muted font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--verdant-emerald)" }} />
                היסטורי
              </span>
              <span className="flex items-center gap-1.5 text-verdant-muted font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm border border-dashed" style={{ borderColor: "var(--verdant-emerald)" }} />
                חזוי
              </span>
            </div>
          </div>
          <GrowthChart currentNetWorth={netWorth.net_worth} />
        </Link>

        {/* Asset Allocation Donut — links to wealth */}
        <Link href={"/wealth" as any} className="v-card p-7 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">אלוקציה</div>
            <h3 className="text-lg font-extrabold text-verdant-ink">היכן הכסף</h3>
          </div>
          <AssetDonut slices={allocSlices} />
        </Link>
      </section>

      {/* ========== Goals + Pension ========== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Goals — links to /vision */}
        <Link
          href={"/vision" as any}
          className="v-card p-7 lg:col-span-2 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">מטרות ויעדים</div>
              <h3 className="text-lg font-extrabold text-verdant-ink">התקדמות ליעדים הקרובים</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-verdant-muted font-semibold">{goals.length} יעדים פעילים</span>
              <span className="material-symbols-outlined text-[16px] text-verdant-muted opacity-0 group-hover:opacity-100 transition-opacity">arrow_back</span>
            </div>
          </div>
          <div className="space-y-5">
            {goals.slice(0, 3).map((g) => {
              const pct = g.fv_projected != null
                ? Math.min(100, Math.max(0, Math.round((g.fv_projected / g.target_amount) * 100)))
                : 0;
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-bold text-verdant-ink">{g.name}</div>
                      <div className="text-[11px] text-verdant-muted mt-0.5">
                        אופק: {new Date(g.target_date).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-verdant-ink">{pct}%</div>
                      <div className="text-[11px] text-verdant-muted">{fmtILS(g.fv_projected)} / {fmtILS(g.target_amount)}</div>
                    </div>
                  </div>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#10b981" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Link>

        {/* Projected Pension — links to /retirement */}
        <Link href={"/retirement" as any} className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer rounded-[14px]">
          <PensionCard monthlyPension={22400} replacementRate={0.78} />
        </Link>
      </section>
    </div>
  );
}
