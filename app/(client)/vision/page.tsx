"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtILS } from "@/lib/format";
import { futureValue } from "@/lib/financial-math";
import { demoAssets, demoGoals, demoCashflow } from "@/lib/stub-data";
import { getTotalLiabilities } from "@/lib/debt-store";
import { onSync } from "@/lib/sync-engine";
import { loadAssumptions } from "@/lib/assumptions";

/* ─────────────────────── Types ─────────────────────── */

interface FundingLayer {
  id: string;
  type: "asset" | "cashflow";
  label: string;
  amount: number;
  annualRate: number;
}

interface VisionGoal {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  targetDate: string;
  lumpToday: number;
  monthlyContrib: number;
  annualRate: number;
  priority: "high" | "medium" | "low";
  linkedAsset?: string;
  fundingSource?: "cashflow" | "asset" | "loan" | "mixed";
  instrument?: string;
  investmentTrack?: string;
  plannerNote?: string;
  fundingLayers?: FundingLayer[];
}

/* ─────────────────────── Constants ─────────────────────── */

const GOAL_ICONS: Record<string, string> = {
  "קרן חירום": "savings", "חינוך": "school", "חינוך ילדים": "school", "לימודים": "school",
  "רכב": "directions_car", "החלפת רכב": "directions_car",
  "דירה": "home", "שדרוג דיור": "home", "רכישת דירה": "home",
  "חתונה": "favorite", "חופשה": "flight_takeoff",
  "פרישה": "elderly", "פרישה מוקדמת": "elderly",
  "עסק": "storefront", "פתיחת עסק": "storefront", "default": "flag",
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "#b91c1c10", text: "#b91c1c" },
  medium: { bg: "#f59e0b10", text: "#b45309" },
  low: { bg: "#0a7a4a10", text: "#0a7a4a" },
};
const PRIORITY_LABELS: Record<string, string> = { high: "גבוהה", medium: "בינונית", low: "נמוכה" };

const INSTRUMENT_RATES: Record<string, number> = {
  "money-market": 0.035, "savings": 0.04, "bonds": 0.045,
  "pension": 0.05, "etf-global": 0.065, "stocks": 0.08,
};
const INSTRUMENT_LABELS: Record<string, string> = {
  "money-market": "קרן כספית", "savings": "חיסכון", "bonds": "אג״ח",
  "pension": "פנסיוני", "etf-global": "מדד עולמי", "stocks": "מניות",
};

const TRACK_OPTIONS: Record<string, { label: string; rate: number }> = {
  conservative: { label: "סולידי (20/80)", rate: 0.04 },
  balanced: { label: "מאוזן (60/40)", rate: 0.055 },
  growth: { label: "צמיחה (80/20)", rate: 0.065 },
  aggressive: { label: "אגרסיבי (S&P 500)", rate: 0.08 },
  custom: { label: "מותאם אישית", rate: 0.05 },
};

const STORAGE_KEY = "verdant:vision_goals";
const TRACK_COLOR: Record<string, string> = { on: "#0a7a4a", behind: "#f59e0b", at_risk: "#b91c1c" };
const TRACK_LABEL: Record<string, string> = { on: "בדרך", behind: "בפיגור", at_risk: "בסיכון" };

/* ─────────────────────── Helpers ─────────────────────── */

function getIcon(name: string): string {
  for (const [key, icon] of Object.entries(GOAL_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return GOAL_ICONS.default;
}

function yearsFromNow(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(0, (target.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function loadGoals(): VisionGoal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    const onbRaw = localStorage.getItem("verdant:onboarding:goals");
    if (onbRaw) {
      const rows: { name: string; cost: string; horizon: string; priority: string }[] = JSON.parse(onbRaw);
      const mapped = rows.filter(r => r.name && r.cost).map((r, i) => ({
        id: `onb-${i}`, name: r.name, icon: getIcon(r.name),
        targetAmount: parseFloat(r.cost.replace(/[^\d.-]/g, "")) || 0,
        targetDate: new Date(Date.now() + (parseFloat(r.horizon) || 5) * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0],
        lumpToday: 0, monthlyContrib: 0, annualRate: 0.05,
        priority: (r.priority === "גבוהה" ? "high" : r.priority === "נמוכה" ? "low" : "medium") as VisionGoal["priority"],
      }));
      if (mapped.length > 0) return mapped;
    }
  } catch {}
  return demoGoals.map(g => ({
    id: g.id, name: g.name, icon: getIcon(g.name),
    targetAmount: g.target_amount, targetDate: g.target_date,
    lumpToday: g.lump_today, monthlyContrib: g.monthly_contrib,
    annualRate: INSTRUMENT_RATES[g.instrument || "savings"] || 0.05,
    priority: g.track === "at_risk" ? "high" : g.track === "behind" ? "medium" : "low",
    linkedAsset: g.instrument === "pension" ? "פנסיוני" : undefined,
  }));
}

function saveGoals(goals: VisionGoal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function computeLayersFV(layers: FundingLayer[], years: number): number {
  return layers.reduce((sum, layer) => {
    if (layer.type === "asset") {
      return sum + futureValue(layer.amount, 0, layer.annualRate, years);
    } else {
      return sum + futureValue(0, layer.amount, layer.annualRate, years);
    }
  }, 0);
}

function goalPV(goal: VisionGoal): number {
  const years = yearsFromNow(goal.targetDate);
  if (years <= 0) return goal.targetAmount;
  const r = goal.annualRate || 0.05;
  return goal.targetAmount / Math.pow(1 + r, years);
}

/* ─────────────────────── Page Component ─────────────────────── */

export default function VisionPage() {
  const [goals, setGoals] = useState<VisionGoal[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [freedomExpenseOverride, setFreedomExpenseOverride] = useState<number | null>(null);

  useEffect(() => {
    setGoals(loadGoals());
    const unsub = onSync("verdant:goals:updated", () => setGoals(loadGoals()));
    return unsub;
  }, []);

  useEffect(() => {
    if (goals.length > 0) {
      const t = setTimeout(() => saveGoals(goals), 400);
      return () => clearTimeout(t);
    }
  }, [goals]);

  // Asset data
  const [clientLiab, setClientLiab] = useState(420000);
  useEffect(() => { const l = getTotalLiabilities(); if (l) setClientLiab(l); }, []);

  const assetData = useMemo(() => {
    const pension = demoAssets.filter(a => a.asset_group === "pension").reduce((s, a) => s + a.balance, 0);
    const investments = demoAssets.filter(a => a.asset_group === "investments").reduce((s, a) => s + a.balance, 0);
    const realestate = demoAssets.filter(a => a.asset_group === "realestate").reduce((s, a) => s + a.balance, 0);
    const liquid = demoAssets.filter(a => a.asset_group === "liquid").reduce((s, a) => s + a.balance, 0);
    const totalAssets = demoAssets.reduce((s, a) => s + a.balance, 0);
    return { pension, investments, realestate, liquid, totalAssets, totalLiab: clientLiab };
  }, [clientLiab]);

  // Projections — with layers support
  const projections = useMemo(() => {
    return goals.map(g => {
      const years = yearsFromNow(g.targetDate);
      const layers = g.fundingLayers || [];
      const layersFV = layers.length > 0 ? computeLayersFV(layers, years) : 0;
      const legacyFV = futureValue(g.lumpToday, g.monthlyContrib, g.annualRate, years);
      const fv = layersFV + legacyFV;
      const gap = g.targetAmount - fv;
      const pct = g.targetAmount > 0 ? Math.min(100, Math.round((fv / g.targetAmount) * 100)) : 0;
      const track: "on" | "behind" | "at_risk" = pct >= 95 ? "on" : pct >= 70 ? "behind" : "at_risk";
      const r = g.annualRate / 12;
      const n = years * 12;
      const fvLump = g.lumpToday * Math.pow(1 + r, n);
      const remaining = g.targetAmount - fvLump - layersFV;
      const requiredMonthly = remaining > 0 && r > 0 && n > 0
        ? remaining / ((Math.pow(1 + r, n) - 1) / r)
        : remaining > 0 ? remaining / n : 0;
      const savingsRatio = requiredMonthly > 0 ? Math.min(1, g.monthlyContrib / requiredMonthly) : (gap <= 0 ? 1 : 0);
      const timeBuffer = years > 3 ? 1 : years > 1 ? 0.9 : 0.7;
      const successProbability = Math.round(Math.min(100, savingsRatio * timeBuffer * 100));
      return { ...g, fv, gap, pct, track, years, requiredMonthly: Math.max(0, requiredMonthly), successProbability, layersFV };
    });
  }, [goals]);

  // ─── Real-Life Freedom Calculator ───
  const monthlyExpense = freedomExpenseOverride || 27000;
  const freedomNumber = monthlyExpense * 300;
  const totalCurrentAssets = assetData.pension + assetData.investments + assetData.liquid;
  const totalGoalsPV = goals.reduce((s, g) => s + goalPV(g), 0);
  const freedomPool = Math.max(0, totalCurrentAssets - totalGoalsPV);
  const earmarkedMonthly = goals.reduce((s, g) => s + g.monthlyContrib, 0);
  const avgYield = 0.05;
  const monthlyContribToFreedom = Math.max(0, 3200 - earmarkedMonthly);

  const freedomData = useMemo(() => {
    let balance = freedomPool;
    for (let y = 1; y <= 60; y++) {
      balance = balance * (1 + avgYield) + monthlyContribToFreedom * 12;
      if (balance >= freedomNumber)
        return { yearsToFreedom: y, freedomAge: 42 + y, freedomBalance: balance };
    }
    return { yearsToFreedom: 99, freedomAge: 142, freedomBalance: balance };
  }, [freedomNumber, freedomPool, monthlyContribToFreedom]);

  const freedomSeverity = freedomData.freedomAge <= 60 ? "green" : freedomData.freedomAge <= 67 ? "yellow" : "red";

  // Gap Analyzer
  const gapAnalysis = useMemo(() => {
    const totalGoalCost = projections.reduce((s, g) => s + g.targetAmount, 0);
    const totalProjected = projections.reduce((s, g) => s + g.fv, 0);
    const totalGap = Math.max(0, totalGoalCost - totalProjected);
    return { totalGoalCost, totalProjected, totalGap };
  }, [projections]);

  // CRUD
  const updateGoal = useCallback((id: string, updates: Partial<VisionGoal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates, icon: getIcon(updates.name || g.name) } : g));
    setEditingId(null);
  }, []);

  const addGoal = useCallback((goal: Omit<VisionGoal, "id" | "icon">) => {
    setGoals(prev => [...prev, { ...goal, id: `g-${Date.now()}`, icon: getIcon(goal.name) }]);
    setShowAddForm(false);
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const addLayer = useCallback((goalId: string) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const layers = g.fundingLayers || [];
      return { ...g, fundingLayers: [...layers, { id: `l-${Date.now()}`, type: "asset" as const, label: "", amount: 0, annualRate: 0.05 }] };
    }));
  }, []);

  const updateLayer = useCallback((goalId: string, layerId: string, updates: Partial<FundingLayer>) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const layers = (g.fundingLayers || []).map(l => l.id === layerId ? { ...l, ...updates } : l);
      return { ...g, fundingLayers: layers };
    }));
  }, []);

  const removeLayer = useCallback((goalId: string, layerId: string) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      return { ...g, fundingLayers: (g.fundingLayers || []).filter(l => l.id !== layerId) };
    }));
  }, []);

  /* ─────────────────────── RENDER ─────────────────────── */

  return (
    <div className="max-w-[1400px] mx-auto" style={{ fontFamily: "'Assistant', sans-serif" }}>
      <PageHeader
        subtitle="Dreams & Freedom · חלומות וחופש"
        title="מטרות, יעדים וחופש כלכלי"
        description="המפה האסטרטגית — יעדים, מימון, ומסלול לחופש כלכלי"
      />

      {/* ═══════════════════════════════════════════════
          SECTION 1 — Goals List (Freedom as first card)
          ═══════════════════════════════════════════════ */}
      <div className="space-y-10 max-w-4xl mx-auto">

        {/* ──── FREEDOM as prominent green goal card ──── */}
        <div className="rounded-2xl p-8 relative overflow-hidden shadow-xl"
          style={{ background: "linear-gradient(135deg,#012d1d 0%,#064e32 50%,#0a7a4a 100%)", color: "#fff" }}>
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 20% 80%, #58e1b0 0%, transparent 50%)" }} />
          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[24px]" style={{ color: "#58e1b0" }}>workspace_premium</span>
                  <div className="text-[11px] uppercase tracking-[0.25em] font-bold" style={{ color: "#58e1b0" }}>
                    FINANCIAL FREEDOM · המטרה הגדולה
                  </div>
                </div>
                <h3 className="text-3xl font-extrabold leading-tight mb-1">חופש כלכלי</h3>
                <p className="text-[13px] opacity-70 font-bold">חוק ה-300 · {fmtILS(monthlyExpense)}/חודש × 300</p>
              </div>
              <span className="text-[10px] font-bold px-3 py-1.5 rounded-full" style={{
                background: freedomSeverity === "green" ? "rgba(88,225,176,0.25)" : freedomSeverity === "yellow" ? "rgba(251,191,36,0.25)" : "rgba(239,68,68,0.25)",
                color: freedomSeverity === "green" ? "#58e1b0" : freedomSeverity === "yellow" ? "#fbbf24" : "#fecaca",
              }}>
                {freedomSeverity === "green" ? "בדרך טובה" : freedomSeverity === "yellow" ? "קרוב" : "רחוק"}
              </span>
            </div>

            {/* Big freedom number */}
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50 mb-2">מספר החופש</div>
              <div className="text-5xl font-extrabold tabular">{fmtILS(freedomNumber)}</div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-5 mb-6 pb-6 border-b" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] font-bold opacity-50 mb-1">הון נוכחי</div>
                <div className="text-base font-extrabold tabular">{fmtILS(totalCurrentAssets)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] font-bold opacity-50 mb-1">בניכוי PV יעדים</div>
                <div className="text-base font-extrabold tabular" style={{ color: "#fbbf24" }}>-{fmtILS(Math.round(totalGoalsPV))}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] font-bold opacity-50 mb-1">Retirement Pool</div>
                <div className="text-base font-extrabold tabular" style={{ color: "#58e1b0" }}>{fmtILS(Math.round(freedomPool))}</div>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-[11px] font-bold mb-2">
                <span style={{ color: "#58e1b0" }}>{Math.round((freedomPool / freedomNumber) * 100)}% הושג</span>
                <span className="opacity-60">חסר {fmtILS(Math.max(0, freedomNumber - freedomPool))}</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${Math.min(100, Math.round((freedomPool / freedomNumber) * 100))}%`,
                  background: "linear-gradient(90deg, #58e1b0, #10b981)",
                }} />
              </div>
            </div>

            {/* Freedom Age + Monthly expense slider */}
            <div className="grid grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold opacity-50 mb-2">התאם הוצאה חודשית</div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold opacity-60 tabular">{fmtILS(10000)}</span>
                  <input type="range" min={10000} max={50000} step={1000} value={monthlyExpense}
                    onChange={e => setFreedomExpenseOverride(parseInt(e.target.value))}
                    className="flex-1 accent-[#58e1b0]" style={{ height: 4 }} />
                  <span className="text-[11px] font-bold opacity-60 tabular">{fmtILS(50000)}</span>
                </div>
              </div>
              <div className="text-center pr-4 border-r" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-[9px] uppercase tracking-[0.2em] font-bold opacity-50 mb-1">גיל חופש</div>
                <div className="text-4xl font-extrabold tabular" style={{
                  color: freedomSeverity === "green" ? "#58e1b0" : freedomSeverity === "yellow" ? "#fbbf24" : "#ef4444",
                }}>
                  {freedomData.freedomAge > 100 ? "100+" : freedomData.freedomAge}
                </div>
                <div className="text-[9px] opacity-50 font-bold mt-1">בעוד {freedomData.yearsToFreedom} שנים</div>
              </div>
            </div>
          </div>
        </div>

        {/* ──── Goals Header ──── */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-verdant-ink">היעדים הספציפיים שלכם</h2>
              <p className="text-[12px] text-verdant-muted font-bold mt-1">{projections.length} יעדים · סה״כ {fmtILS(goals.reduce((s, g) => s + g.targetAmount, 0))}</p>
            </div>
            <button onClick={() => setShowAddForm(true)}
              className="text-[12px] font-bold px-5 py-2.5 rounded-xl text-white flex items-center gap-2 shadow-sm hover:shadow-md transition-shadow"
              style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
              <span className="material-symbols-outlined text-[16px]">add</span>הוסף יעד
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div ref={el => { if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}>
              <GoalAddForm onSave={addGoal} onCancel={() => setShowAddForm(false)} />
            </div>
          )}

          {/* Goal Cards */}
          <div className="space-y-8">
            {projections.map(g => {
              const isEditing = editingId === g.id;
              const trackColor = TRACK_COLOR[g.track];
              const layers = g.fundingLayers || [];
              const instrumentLabel = g.instrument ? INSTRUMENT_LABELS[g.instrument] : null;
              const trackLabel = g.investmentTrack ? TRACK_OPTIONS[g.investmentTrack]?.label : null;

              return (
                <div key={g.id} className="rounded-2xl transition-all duration-200 hover:shadow-lg"
                  style={{ background: "#fff", border: "1px solid #d8e0d0", boxShadow: "0 2px 8px rgba(1,45,29,0.04)" }}>

                  {/* ──── Card Header: Name + Date BIG ──── */}
                  <div className="px-8 pt-8 pb-5 border-b" style={{ borderColor: "#eef2e8" }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-2xl font-extrabold text-verdant-ink leading-tight">{g.name}</h3>
                        <div className="text-[15px] text-verdant-muted font-bold mt-2">
                          {formatDate(g.targetDate)} · בעוד{" "}
                          {g.years < 1
                            ? `${Math.max(1, Math.ceil(g.years * 12))} חודשים`
                            : g.years < 2
                              ? `שנה ${Math.round((g.years % 1) * 12) > 0 ? `ו-${Math.round((g.years % 1) * 12)} חודשים` : ""}`
                              : `${Math.round(g.years)} שנים`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: `${trackColor}12`, color: trackColor }}>
                          {TRACK_LABEL[g.track]}
                        </span>
                        <button onClick={() => setEditingId(isEditing ? null : g.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-verdant-bg transition-colors" style={{ background: "#f4f7ed" }}>
                          <span className="material-symbols-outlined text-[16px] text-verdant-muted">{isEditing ? "close" : "edit"}</span>
                        </button>
                        <button onClick={() => deleteGoal(g.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors" style={{ background: "#fef2f2" }}>
                          <span className="material-symbols-outlined text-[16px]" style={{ color: "#b91c1c" }}>delete_outline</span>
                        </button>
                      </div>
                    </div>

                    {/* Target amount */}
                    <div className="text-3xl font-extrabold tabular" style={{ color: "#012d1d" }}>
                      {fmtILS(g.targetAmount)}
                    </div>
                  </div>

                  {/* ──── Progress ──── */}
                  <div className="px-8 py-5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-verdant-muted mb-2">
                      <span className="tabular">{g.pct}% הושג</span>
                      <span className="tabular">{fmtILS(Math.round(g.fv))} מתוך {fmtILS(g.targetAmount)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${g.pct}%`, background: `linear-gradient(90deg, ${trackColor}99, ${trackColor})` }} />
                    </div>
                  </div>

                  {/* ──── Key Details: What / When / Instrument ──── */}
                  <div className="px-8 pb-5">
                    <div className="grid grid-cols-4 gap-6">
                      <div>
                        <div className="text-[10px] font-bold text-verdant-muted mb-1">חיסכון חודשי</div>
                        <div className="text-[14px] font-extrabold tabular text-verdant-ink">{fmtILS(g.monthlyContrib)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-verdant-muted mb-1">סכום פתיחה</div>
                        <div className="text-[14px] font-extrabold tabular text-verdant-ink">{fmtILS(g.lumpToday)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-verdant-muted mb-1">מכשיר</div>
                        <div className="text-[14px] font-extrabold text-verdant-ink">{instrumentLabel || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-verdant-muted mb-1">מסלול · תשואה</div>
                        <div className="text-[14px] font-extrabold text-verdant-ink">
                          {trackLabel ? `${trackLabel}` : `${(g.annualRate * 100).toFixed(1)}%`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ──── Funding Layers ──── */}
                  {(layers.length > 0 || true) && (
                    <div className="px-8 pb-6 border-t" style={{ borderColor: "#eef2e8" }}>
                      <div className="flex items-center justify-between pt-5 mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-extrabold text-verdant-ink">שכבות מימון</span>
                          {layers.length > 0 && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: "#0a7a4a10", color: "#0a7a4a" }}>
                              {layers.length} שכבות · {fmtILS(Math.round(g.layersFV))}
                            </span>
                          )}
                        </div>
                        <button onClick={() => addLayer(g.id)}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors hover:shadow-sm"
                          style={{ background: "#0a7a4a10", color: "#0a7a4a" }}>
                          <span className="material-symbols-outlined text-[14px]">add</span>שכבה
                        </button>
                      </div>

                      {layers.length > 0 ? (
                        <div className="space-y-2.5">
                          {layers.map((layer) => (
                            <div key={layer.id} className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: "#f9faf2", border: "1px solid #eef2e8" }}>
                              <select value={layer.type}
                                onChange={e => updateLayer(g.id, layer.id, { type: e.target.value as "asset" | "cashflow" })}
                                className="text-[11px] font-bold bg-white outline-none cursor-pointer rounded-lg px-2.5 py-2 border" style={{ borderColor: "#e5e7d8", minWidth: 110 }}>
                                <option value="asset">נכס קיים</option>
                                <option value="cashflow">הזרמה חודשית</option>
                              </select>
                              <input type="text" placeholder={layer.type === "asset" ? "שם הנכס" : "מקור הזרמה"}
                                value={layer.label} onChange={e => updateLayer(g.id, layer.id, { label: e.target.value })}
                                className="text-[11px] font-bold bg-white rounded-lg px-3 py-2 border outline-none flex-1" style={{ borderColor: "#e5e7d8" }} />
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-verdant-muted font-bold">{layer.type === "asset" ? "₪" : "₪/חודש"}</span>
                                <input type="number" value={layer.amount || ""}
                                  onChange={e => updateLayer(g.id, layer.id, { amount: parseFloat(e.target.value) || 0 })}
                                  className="text-[11px] font-bold bg-white rounded-lg px-3 py-2 border outline-none w-24 tabular" style={{ borderColor: "#e5e7d8" }} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-verdant-muted font-bold">תשואה</span>
                                <input type="number" value={((layer.annualRate || 0.05) * 100).toFixed(1)}
                                  onChange={e => updateLayer(g.id, layer.id, { annualRate: (parseFloat(e.target.value) || 5) / 100 })}
                                  className="text-[11px] font-bold bg-white rounded-lg px-2.5 py-2 border outline-none w-16 tabular" style={{ borderColor: "#e5e7d8" }} />
                                <span className="text-[10px] text-verdant-muted font-bold">%</span>
                              </div>
                              <button onClick={() => removeLayer(g.id, layer.id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors flex-shrink-0" style={{ background: "#fef2f2" }}>
                                <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>close</span>
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold text-verdant-muted">
                            <span>צבירה משולבת:</span>
                            <span className="tabular font-extrabold" style={{ color: "#0a7a4a" }}>{fmtILS(Math.round(g.layersFV))}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-verdant-muted py-3 px-4 rounded-xl" style={{ background: "#f9faf2", border: "1px dashed #d8e0d0" }}>
                          הוסיפו שכבות מימון כדי לשלב נכסים קיימים עם הזרמות חודשיות
                        </div>
                      )}
                    </div>
                  )}

                  {/* Planner note */}
                  {g.plannerNote && (
                    <div className="mx-8 mb-6 p-4 rounded-xl" style={{ background: "#eff6ff", border: "1px solid #93c5fd30" }}>
                      <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: "#1d4ed8" }}>המלצת מתכנן</div>
                      <div className="text-[12px] font-bold leading-relaxed" style={{ color: "#1e40af" }}>{g.plannerNote}</div>
                    </div>
                  )}

                  {/* Gap alert */}
                  {g.gap > 0 && (
                    <div className="mx-8 mb-6 p-4 rounded-xl flex items-center justify-between" style={{ background: "#fef2f2", border: "1px solid #fecaca40" }}>
                      <span className="text-[12px] font-bold" style={{ color: "#b91c1c" }}>
                        פער {fmtILS(Math.round(g.gap))} · נדרש {fmtILS(Math.round(g.requiredMonthly))}/חודש
                      </span>
                      {g.requiredMonthly > g.monthlyContrib && (
                        <button onClick={() => updateGoal(g.id, { monthlyContrib: Math.ceil(g.requiredMonthly / 100) * 100 })}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-lg" style={{ background: "#0a7a4a12", color: "#0a7a4a" }}>
                          הגדל ל-{fmtILS(Math.ceil(g.requiredMonthly / 100) * 100)}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Inline Edit Form */}
                  {isEditing && (
                    <div className="mx-8 mb-6">
                      <GoalEditForm goal={g} onSave={u => updateGoal(g.id, u)} onCancel={() => setEditingId(null)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ──── Quick Stats Summary ──── */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl p-5 text-center" style={{ background: "#fff", border: "1px solid #d8e0d0" }}>
            <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-1">יעדים</div>
            <div className="text-2xl font-extrabold tabular text-verdant-ink">{projections.length}</div>
          </div>
          <div className="rounded-xl p-5 text-center" style={{ background: "#fff", border: "1px solid #d8e0d0" }}>
            <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-1">בדרך</div>
            <div className="text-2xl font-extrabold tabular" style={{ color: "#0a7a4a" }}>{projections.filter(g => g.track === "on").length}</div>
          </div>
          <div className="rounded-xl p-5 text-center" style={{ background: "#fff", border: "1px solid #d8e0d0" }}>
            <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-1">בסיכון</div>
            <div className="text-2xl font-extrabold tabular" style={{ color: "#b91c1c" }}>{projections.filter(g => g.track !== "on").length}</div>
          </div>
          <div className="rounded-xl p-5 text-center" style={{ background: "#fff", border: "1px solid #d8e0d0" }}>
            <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-verdant-muted mb-1">הפקדה חודשית</div>
            <div className="text-2xl font-extrabold tabular" style={{ color: "#0a7a4a" }}>{fmtILS(goals.reduce((s, g) => s + g.monthlyContrib, 0))}</div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 2 — Gap Analyzer (simplified)
          ═══════════════════════════════════════════════ */}
      <section className="mt-14 mb-8">
        <div className="rounded-2xl p-8" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
          <h2 className="text-lg font-extrabold text-verdant-ink mb-6">ניתוח פערים</h2>

          <div className="grid grid-cols-3 gap-5 mb-8">
            <div className="rounded-xl p-5 text-center" style={{ background: "#fff", border: "1px solid #eef2e8" }}>
              <div className="text-[10px] font-bold text-verdant-muted mb-1">סך עלות יעדים</div>
              <div className="text-2xl font-extrabold tabular text-verdant-ink">{fmtILS(gapAnalysis.totalGoalCost)}</div>
            </div>
            <div className="rounded-xl p-5 text-center" style={{ background: "#fff", border: "1px solid #eef2e8" }}>
              <div className="text-[10px] font-bold text-verdant-muted mb-1">תחזית מצטברת</div>
              <div className="text-2xl font-extrabold tabular" style={{ color: "#0a7a4a" }}>{fmtILS(Math.round(gapAnalysis.totalProjected))}</div>
            </div>
            <div className="rounded-xl p-5 text-center" style={{ background: gapAnalysis.totalGap > 0 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${gapAnalysis.totalGap > 0 ? "#fecaca" : "#bbf7d0"}` }}>
              <div className="text-[10px] font-bold text-verdant-muted mb-1">פער כולל</div>
              <div className="text-2xl font-extrabold tabular" style={{ color: gapAnalysis.totalGap > 0 ? "#b91c1c" : "#0a7a4a" }}>
                {gapAnalysis.totalGap > 0 ? fmtILS(Math.round(gapAnalysis.totalGap)) : "אין פער"}
              </div>
            </div>
          </div>

          {gapAnalysis.totalGap > 0 ? (
            <div className="p-5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca40" }}>
              <p className="text-[14px] font-extrabold text-verdant-ink">
                חסר לכם{" "}
                <span className="tabular" style={{ color: "#b91c1c" }}>{fmtILS(Math.round(gapAnalysis.totalGap))}</span>{" "}
                להגשמת כל היעדים.
              </p>
            </div>
          ) : (
            <div className="p-5 rounded-xl" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <p className="text-[13px] font-bold" style={{ color: "#0a7a4a" }}>כל היעדים שלכם מכוסים בתוכנית הנוכחית.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────── Sub-Components ─────────────────────── */

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-verdant-muted">{label}</span>
      <span className="text-[13px] font-extrabold tabular" style={{ color: color || "#012d1d" }}>{value}</span>
    </div>
  );
}

function GoalEditForm({ goal, onSave, onCancel }: { goal: VisionGoal; onSave: (u: Partial<VisionGoal>) => void; onCancel: () => void }) {
  const [name, setName] = useState(goal.name);
  const [targetAmount, setTargetAmount] = useState(goal.targetAmount.toString());
  const [targetDate, setTargetDate] = useState(goal.targetDate);
  const [monthlyContrib, setMonthlyContrib] = useState(goal.monthlyContrib.toString());
  const [lumpToday, setLumpToday] = useState(goal.lumpToday.toString());
  const [annualRate, setAnnualRate] = useState((goal.annualRate * 100).toFixed(1));
  const [priority, setPriority] = useState(goal.priority);
  const [instrument, setInstrument] = useState(goal.instrument || "savings");
  const [investmentTrack, setInvestmentTrack] = useState(goal.investmentTrack || "balanced");
  const [plannerNote, setPlannerNote] = useState(goal.plannerNote || "");

  return (
    <div className="rounded-xl p-6 space-y-4" style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}>
      <div className="text-[11px] font-extrabold text-verdant-ink">עריכת יעד</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="שם היעד" value={name} onChange={setName} />
        <Field label="סכום יעד" value={targetAmount} onChange={setTargetAmount} type="number" />
        <Field label="תאריך יעד" value={targetDate} onChange={setTargetDate} type="date" />
        <Field label="חיסכון חודשי" value={monthlyContrib} onChange={setMonthlyContrib} type="number" />
        <Field label="סכום פתיחה" value={lumpToday} onChange={setLumpToday} type="number" />
        <Field label="תשואה %" value={annualRate} onChange={setAnnualRate} type="number" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">מכשיר השקעה</div>
          <select value={instrument} onChange={e => setInstrument(e.target.value)}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            {Object.entries(INSTRUMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">מסלול</div>
          <select value={investmentTrack} onChange={e => {
            setInvestmentTrack(e.target.value);
            const rate = TRACK_OPTIONS[e.target.value]?.rate;
            if (rate) setAnnualRate((rate * 100).toFixed(1));
          }}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            {Object.entries(TRACK_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="text-[9px] font-bold text-verdant-muted mb-1">הערת מתכנן</div>
        <textarea value={plannerNote} onChange={e => setPlannerNote(e.target.value)}
          placeholder="המלצה למשפחה..."
          className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none resize-none"
          style={{ borderColor: "#d8e0d0", background: "#fff", minHeight: 48 }} />
      </div>
      <div className="flex items-center gap-3">
        <div className="text-[9px] font-bold text-verdant-muted ml-2">עדיפות:</div>
        {(["high", "medium", "low"] as const).map(p => (
          <button key={p} onClick={() => setPriority(p)}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: priority === p ? PRIORITY_COLORS[p].text : "#eef2e8", color: priority === p ? "#fff" : PRIORITY_COLORS[p].text }}>
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "#d8e0d0" }}>
        <button onClick={() => onSave({
          name, targetAmount: parseFloat(targetAmount) || 0, targetDate,
          monthlyContrib: parseFloat(monthlyContrib) || 0, lumpToday: parseFloat(lumpToday) || 0,
          annualRate: (parseFloat(annualRate) || 5) / 100, priority,
          instrument, investmentTrack,
          plannerNote: plannerNote || undefined,
        })} className="text-[12px] font-bold px-5 py-2 rounded-xl text-white"
          style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
          שמור שינויים
        </button>
        <button onClick={onCancel} className="text-[12px] font-bold px-4 py-2 rounded-xl text-verdant-muted" style={{ background: "#eef2e8" }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function GoalAddForm({ onSave, onCancel }: { onSave: (g: Omit<VisionGoal, "id" | "icon">) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState(new Date(Date.now() + 3 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]);
  const [monthlyContrib, setMonthlyContrib] = useState("");
  const [lumpToday, setLumpToday] = useState("0");
  const [annualRate, setAnnualRate] = useState("5.0");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [instrument, setInstrument] = useState("savings");
  const [investmentTrack, setInvestmentTrack] = useState("balanced");

  return (
    <div className="rounded-2xl p-6 space-y-4" style={{ background: "#fff", border: "2px solid #0a7a4a33" }}>
      <h3 className="text-base font-extrabold text-verdant-ink">יעד חדש</h3>
      <div className="grid grid-cols-3 gap-3">
        <Field label="שם היעד" value={name} onChange={setName} placeholder="למשל: החלפת רכב" />
        <Field label="סכום יעד (₪)" value={targetAmount} onChange={setTargetAmount} type="number" placeholder="150000" />
        <Field label="תאריך יעד" value={targetDate} onChange={setTargetDate} type="date" />
        <Field label="חיסכון חודשי (₪)" value={monthlyContrib} onChange={setMonthlyContrib} type="number" placeholder="2000" />
        <Field label="סכום פתיחה (₪)" value={lumpToday} onChange={setLumpToday} type="number" />
        <Field label="תשואה %" value={annualRate} onChange={setAnnualRate} type="number" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">מכשיר</div>
          <select value={instrument} onChange={e => setInstrument(e.target.value)}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            {Object.entries(INSTRUMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[9px] font-bold text-verdant-muted mb-1">מסלול</div>
          <select value={investmentTrack} onChange={e => {
            setInvestmentTrack(e.target.value);
            const rate = TRACK_OPTIONS[e.target.value]?.rate;
            if (rate) setAnnualRate((rate * 100).toFixed(1));
          }}
            className="w-full text-[11px] font-bold rounded-lg px-3 py-2 border outline-none" style={{ borderColor: "#d8e0d0", background: "#fff" }}>
            {Object.entries(TRACK_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-[9px] font-bold text-verdant-muted ml-2">עדיפות:</div>
        {(["high", "medium", "low"] as const).map(p => (
          <button key={p} onClick={() => setPriority(p)}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: priority === p ? PRIORITY_COLORS[p].text : "#eef2e8", color: priority === p ? "#fff" : PRIORITY_COLORS[p].text }}>
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "#eef2e8" }}>
        <button disabled={!name || !targetAmount}
          onClick={() => onSave({
            name, targetAmount: parseFloat(targetAmount) || 0, targetDate,
            monthlyContrib: parseFloat(monthlyContrib) || 0, lumpToday: parseFloat(lumpToday) || 0,
            annualRate: (parseFloat(annualRate) || 5) / 100, priority,
            instrument, investmentTrack,
          })}
          className="text-[12px] font-bold px-5 py-2 rounded-xl text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
          הוסף יעד
        </button>
        <button onClick={onCancel} className="text-[12px] font-bold px-4 py-2 rounded-xl text-verdant-muted" style={{ background: "#eef2e8" }}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold text-verdant-muted mb-1">{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-[11px] font-bold px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-verdant-accent/30"
        style={{ borderColor: "#d8e0d0", background: "#fff" }} />
    </div>
  );
}
