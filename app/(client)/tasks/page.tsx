"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { fmtILS } from "@/lib/format";
import { loadDebtData, getDebtSummary } from "@/lib/debt-store";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

interface AdvisorRecommendation {
  id: string;
  text: string;
  createdAt: string;
}

interface SystemInsight {
  id: string;
  icon: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  source: string;     // e.g. "budget", "debt", "cashflow"
}

interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  fromSystem?: boolean;  // true if converted from system insight
  createdAt: string;
}

interface PageData {
  advisorRecs: AdvisorRecommendation[];
  tasks: TaskItem[];
}

/* ═══════════════════════════════════════════════════════════
   Persistence
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = "verdant:client_tasks";

function loadPageData(): PageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { advisorRecs: [], tasks: [] };
}

function savePageData(data: PageData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

const uid = () => "t" + Math.random().toString(36).slice(2, 9);
const nowISO = () => new Date().toISOString();

/* ═══════════════════════════════════════════════════════════
   System Insights Generator
   ═══════════════════════════════════════════════════════════ */

function generateSystemInsights(): SystemInsight[] {
  const insights: SystemInsight[] = [];
  const now = new Date();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const monthKey = `verdant:budget_${curYear}_${String(curMonth + 1).padStart(2, "0")}`;

  // 1) Budget overspend detection
  try {
    const raw = localStorage.getItem(monthKey);
    if (raw) {
      const budget = JSON.parse(raw);
      const sections = budget.sections || {};
      for (const [sectionKey, rows] of Object.entries(sections) as [string, any[]][]) {
        if (sectionKey === "income") continue;
        for (const row of rows) {
          const b = Number(row.budget) || 0;
          const a = Number(row.actual) || 0;
          if (b > 0 && a > b) {
            const pct = Math.round(((a - b) / b) * 100);
            if (pct >= 10) {
              insights.push({
                id: `budget-over-${row.id}`,
                icon: "warning",
                title: `חריגה של ${pct}% ב"${row.name}"`,
                detail: `תכנון: ${fmtILS(b)} · ביצוע: ${fmtILS(a)} · חריגה של ${fmtILS(a - b)}`,
                severity: pct >= 30 ? "high" : "medium",
                source: "budget",
              });
            }
          }
          // Check sub-items too
          if (row.subItems) {
            for (const sub of row.subItems) {
              const sb = Number(sub.budget) || 0;
              const sa = Number(sub.actual) || 0;
              if (sb > 0 && sa > sb) {
                const spct = Math.round(((sa - sb) / sb) * 100);
                if (spct >= 15) {
                  insights.push({
                    id: `budget-sub-over-${sub.id}`,
                    icon: "warning",
                    title: `חריגה של ${spct}% ב"${sub.name}" (${row.name})`,
                    detail: `תכנון: ${fmtILS(sb)} · ביצוע: ${fmtILS(sa)}`,
                    severity: spct >= 40 ? "high" : "medium",
                    source: "budget",
                  });
                }
              }
            }
          }
        }
      }

      // Budget vs income ratio check
      const incBudget = (sections.income || []).reduce((s: number, r: any) => s + (Number(r.budget) || 0), 0);
      const expBudget = ["fixed", "variable", "debt"].reduce((s: number, k: string) =>
        s + (sections[k] || []).reduce((ss: number, r: any) => ss + (Number(r.budget) || 0), 0), 0);
      if (incBudget > 0 && expBudget > incBudget) {
        insights.push({
          id: "budget-deficit",
          icon: "trending_down",
          title: "תקציב חודשי בגירעון",
          detail: `סה"כ הוצאות מתוכננות (${fmtILS(expBudget)}) גבוהות מההכנסה (${fmtILS(incBudget)})`,
          severity: "high",
          source: "budget",
        });
      }
    }
  } catch {}

  // 2) Debt-based insights
  try {
    const debtData = loadDebtData();
    const summary = getDebtSummary(debtData);

    // High debt service ratio (if budget income exists)
    try {
      const raw = localStorage.getItem(monthKey);
      if (raw) {
        const budget = JSON.parse(raw);
        const incBudget = (budget.sections?.income || []).reduce((s: number, r: any) => s + (Number(r.budget) || 0), 0);
        if (incBudget > 0 && summary.monthlyTotal > 0) {
          const debtRatio = (summary.monthlyTotal / incBudget) * 100;
          if (debtRatio > 35) {
            insights.push({
              id: "debt-crunch",
              icon: "credit_card_off",
              title: `חנק אשראי — ${Math.round(debtRatio)}% מההכנסה`,
              detail: `החזר חודשי כולל ${fmtILS(summary.monthlyTotal)} מתוך הכנסה של ${fmtILS(incBudget)}. מומלץ מתחת ל-35%.`,
              severity: debtRatio > 50 ? "high" : "medium",
              source: "debt",
            });
          }
        }
      }
    } catch {}

    // Large remaining balance warning
    if (summary.loansBalance > 50000) {
      insights.push({
        id: "debt-large-balance",
        icon: "account_balance",
        title: `יתרה לסילוק גבוהה — ${fmtILS(summary.loansBalance)}`,
        detail: `קיימות ${summary.activeLoans.length} הלוואות פעילות עם יתרה משמעותית. בדוק אפשרויות מיחזור.`,
        severity: "medium",
        source: "debt",
      });
    }

    // Mortgage high interest
    if (summary.mortgageAvgInterest > 5) {
      insights.push({
        id: "mortgage-high-rate",
        icon: "home",
        title: `ריבית משכנתא גבוהה — ${summary.mortgageAvgInterest.toFixed(1)}%`,
        detail: `ריבית ממוצעת משוקללת של ${summary.mortgageAvgInterest.toFixed(2)}%. שקול מיחזור בארגז הכלים.`,
        severity: "medium",
        source: "debt",
      });
    }

    // No emergency fund (check onboarding assets)
    try {
      const assetsRaw = localStorage.getItem("verdant:onboarding:assets");
      if (assetsRaw) {
        const assets = JSON.parse(assetsRaw);
        const liquidAssets = assets.filter((a: any) =>
          (a.type || "").includes("חיסכון") || (a.type || "").includes("פיקדון"),
        );
        const totalLiquid = liquidAssets.reduce((s: number, a: any) => s + (Number(a.value) || 0), 0);
        if (totalLiquid < summary.monthlyTotal * 3 && summary.monthlyTotal > 0) {
          insights.push({
            id: "low-liquidity",
            icon: "savings",
            title: "נזילות נמוכה ביחס לחובות",
            detail: "החיסכון הנזיל נמוך מ-3 חודשי החזר חוב. מומלץ לבנות כרית ביטחון.",
            severity: "medium",
            source: "debt",
          });
        }
      }
    } catch {}
  } catch {}

  return insights;
}

/* ═══════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function TasksPage() {
  const [data, setData] = useState<PageData>({ advisorRecs: [], tasks: [] });
  const [newRecText, setNewRecText] = useState("");
  const [newTaskText, setNewTaskText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Load data
  useEffect(() => {
    setData(loadPageData());
  }, []);

  // Auto-save with debounce
  const autoSave = useCallback((newData: PageData) => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePageData(newData);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  }, []);

  // Generate system insights on mount
  const systemInsights = useMemo(() => generateSystemInsights(), []);

  // ── Advisor Recommendations CRUD ──
  const addRecommendation = useCallback(() => {
    const text = newRecText.trim();
    if (!text) return;
    const newData = {
      ...data,
      advisorRecs: [...data.advisorRecs, { id: uid(), text, createdAt: nowISO() }],
    };
    setData(newData);
    setNewRecText("");
    autoSave(newData);
    textAreaRef.current?.focus();
  }, [data, newRecText, autoSave]);

  const deleteRecommendation = useCallback((id: string) => {
    const newData = { ...data, advisorRecs: data.advisorRecs.filter(r => r.id !== id) };
    setData(newData);
    autoSave(newData);
  }, [data, autoSave]);

  // ── Tasks CRUD ──
  const addTask = useCallback((text?: string) => {
    const t = (text || newTaskText).trim();
    if (!t) return;
    const newData = {
      ...data,
      tasks: [...data.tasks, { id: uid(), text: t, done: false, createdAt: nowISO() }],
    };
    setData(newData);
    if (!text) setNewTaskText("");
    autoSave(newData);
  }, [data, newTaskText, autoSave]);

  const toggleTask = useCallback((id: string) => {
    const newData = {
      ...data,
      tasks: data.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t),
    };
    setData(newData);
    autoSave(newData);
  }, [data, autoSave]);

  const deleteTask = useCallback((id: string) => {
    const newData = { ...data, tasks: data.tasks.filter(t => t.id !== id) };
    setData(newData);
    autoSave(newData);
  }, [data, autoSave]);

  const convertInsightToTask = useCallback((insight: SystemInsight) => {
    // Check if already converted
    const exists = data.tasks.some(t => t.text === insight.title);
    if (exists) return;
    const newData = {
      ...data,
      tasks: [...data.tasks, {
        id: uid(),
        text: insight.title,
        done: false,
        fromSystem: true,
        createdAt: nowISO(),
      }],
    };
    setData(newData);
    autoSave(newData);
  }, [data, autoSave]);

  const openTasks = data.tasks.filter(t => !t.done);
  const doneTasks = data.tasks.filter(t => t.done);

  return (
    <div className="max-w-4xl mx-auto">
      {/* ═══════ Header ═══════ */}
      <header className="mb-8 pb-5 border-b" style={{ borderColor: "#e2e8d8" }}>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-extrabold mb-1" style={{ color: "#5a7a6a" }}>
              Action Center · מרכז פעולה
            </div>
            <h1 className="text-[22px] font-extrabold tracking-tight leading-tight" style={{ color: "#012d1d" }}>
              המלצות ומשימות
            </h1>
            <p className="text-[12px] font-medium mt-1" style={{ color: "#5a7a6a" }}>
              המלצות אישיות מהמתכנן, תובנות מערכת אוטומטיות, ורשימת משימות לביצוע
            </p>
          </div>
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
      </header>

      {/* ═══════ 1. Advisor Recommendations ═══════ */}
      <section
        className="bg-white rounded-2xl p-5 md:p-7 mb-5"
        style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#012d1d" }}>
            <span className="material-symbols-outlined text-[16px] text-white">edit_note</span>
          </div>
          <div>
            <h2 className="text-[15px] font-extrabold" style={{ color: "#012d1d" }}>המלצות אישיות מהמתכנן</h2>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#5a7a6a" }}>
              Advisor Recommendations
            </div>
          </div>
        </div>

        {/* Existing recommendations */}
        {data.advisorRecs.length > 0 && (
          <div className="space-y-2 mb-4">
            {data.advisorRecs.map(rec => (
              <div
                key={rec.id}
                className="flex items-start gap-3 rounded-xl p-3.5 group"
                style={{ background: "#f8faf5", border: "1px solid #eef2e8" }}
              >
                <span className="material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0" style={{ color: "#0a7a4a" }}>
                  lightbulb
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-relaxed" style={{ color: "#012d1d" }}>
                    {rec.text}
                  </div>
                  <div className="text-[10px] font-semibold mt-1" style={{ color: "#5a7a6a" }}>
                    {new Date(rec.createdAt).toLocaleDateString("he-IL")}
                  </div>
                </div>
                <button
                  onClick={() => deleteRecommendation(rec.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="מחק"
                >
                  <span className="material-symbols-outlined text-[14px] hover:text-red-600" style={{ color: "#5a7a6a" }}>close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new recommendation */}
        <div className="flex gap-2">
          <textarea
            ref={textAreaRef}
            value={newRecText}
            onChange={e => setNewRecText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addRecommendation(); } }}
            placeholder="כתוב המלצה ללקוח... (למשל: כדאי לבדוק איחוד הלוואות בבנק X)"
            className="flex-1 text-[13px] font-medium rounded-xl px-4 py-3 resize-none focus:outline-none transition-colors"
            style={{
              color: "#012d1d",
              background: "#fff",
              border: "1.5px solid #e2e8d8",
              minHeight: 48,
              maxHeight: 120,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "#0a7a4a"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#e2e8d8"; }}
            rows={1}
          />
          <button
            onClick={addRecommendation}
            disabled={!newRecText.trim()}
            className="self-end px-4 py-3 rounded-xl text-[12px] font-extrabold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            style={{ background: "#012d1d" }}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>
      </section>

      {/* ═══════ 2. System Insights ═══════ */}
      {systemInsights.length > 0 && (
        <section
          className="rounded-2xl p-5 md:p-7 mb-5"
          style={{
            background: "linear-gradient(135deg, #fefff9 0%, #f8fdf6 100%)",
            border: "1.5px solid #d1fae5",
            boxShadow: "0 1px 2px rgba(10,122,74,.04), 0 6px 20px rgba(10,122,74,.06)",
          }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}>
              <span className="material-symbols-outlined text-[16px]" style={{ color: "#065f46" }}>auto_awesome</span>
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold" style={{ color: "#012d1d" }}>תובנות מערכת אוטומטיות</h2>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#5a7a6a" }}>
                {systemInsights.length} תובנות זוהו · System Insights
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {systemInsights.map(ins => {
              const isConverted = data.tasks.some(t => t.text === ins.title);
              return (
                <div
                  key={ins.id}
                  className="flex items-start gap-3 rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,.8)",
                    border: "1px solid #d1fae5",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <span
                    className="material-symbols-outlined text-[18px] mt-0.5 flex-shrink-0"
                    style={{
                      color: ins.severity === "high" ? "#dc2626" : ins.severity === "medium" ? "#d97706" : "#0a7a4a",
                    }}
                  >
                    {ins.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: ins.severity === "high" ? "#fef2f2" : ins.severity === "medium" ? "#fffbeb" : "#f0fdf4",
                          color: ins.severity === "high" ? "#dc2626" : ins.severity === "medium" ? "#d97706" : "#065f46",
                        }}
                      >
                        {ins.severity === "high" ? "דחוף" : ins.severity === "medium" ? "שים לב" : "מידע"}
                      </span>
                    </div>
                    <div className="text-[13px] font-bold" style={{ color: "#012d1d" }}>{ins.title}</div>
                    <div className="text-[11px] font-medium mt-0.5" style={{ color: "#5a7a6a" }}>{ins.detail}</div>
                  </div>
                  {isConverted ? (
                    <span className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "#d1fae5", color: "#065f46" }}>
                      <span className="material-symbols-outlined text-[12px] align-middle">check</span> במשימות
                    </span>
                  ) : (
                    <button
                      onClick={() => convertInsightToTask(ins)}
                      className="flex-shrink-0 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
                      style={{ background: "#0a7a4a" }}
                    >
                      הפוך למשימה
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══════ 3. Task Checklist ═══════ */}
      <section
        className="bg-white rounded-2xl p-5 md:p-7 mb-5"
        style={{ border: "1px solid #e2e8d8", boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#0a7a4a" }}>
              <span className="material-symbols-outlined text-[16px] text-white">checklist</span>
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold" style={{ color: "#012d1d" }}>צ׳ק-ליסט לביצוע</h2>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#5a7a6a" }}>
                {openTasks.length} פתוחות · {doneTasks.length} הושלמו
              </div>
            </div>
          </div>
          {doneTasks.length > 0 && (
            <div
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
              style={{ background: "#d1fae5", color: "#065f46" }}
            >
              {Math.round((doneTasks.length / data.tasks.length) * 100)}% הושלם
            </div>
          )}
        </div>

        {/* Progress bar */}
        {data.tasks.length > 0 && (
          <div className="w-full h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: "#eef2e8" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${data.tasks.length > 0 ? (doneTasks.length / data.tasks.length) * 100 : 0}%`,
                background: "linear-gradient(90deg, #0a7a4a, #10b981)",
              }}
            />
          </div>
        )}

        {/* Add new task */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTask(); }}
            placeholder="הוסף משימה חדשה..."
            className="flex-1 text-[13px] font-medium rounded-xl px-4 py-2.5 focus:outline-none transition-colors"
            style={{ color: "#012d1d", background: "#fff", border: "1.5px solid #e2e8d8" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#0a7a4a"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#e2e8d8"; }}
          />
          <button
            onClick={() => addTask()}
            disabled={!newTaskText.trim()}
            className="px-4 py-2.5 rounded-xl text-[12px] font-extrabold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            style={{ background: "#0a7a4a" }}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>

        {/* Open tasks */}
        {openTasks.length > 0 && (
          <div className="space-y-1 mb-3">
            {openTasks.map(task => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 group transition-colors hover:bg-[#f8faf5]"
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  className="flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all hover:border-[#0a7a4a]"
                  style={{ borderColor: "#d1d5db" }}
                >
                  {/* empty checkbox */}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold" style={{ color: "#012d1d" }}>{task.text}</span>
                  {task.fromSystem && (
                    <span className="inline-flex items-center gap-0.5 mr-2 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#eff6ff", color: "#3b82f6" }}>
                      <span className="material-symbols-outlined text-[10px]">auto_awesome</span>
                      מערכת
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="מחק"
                >
                  <span className="material-symbols-outlined text-[13px] hover:text-red-600" style={{ color: "#5a7a6a" }}>close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Done tasks */}
        {doneTasks.length > 0 && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2 mt-3 pt-3" style={{ color: "#5a7a6a", borderTop: "1px solid #eef2e8" }}>
              הושלמו ({doneTasks.length})
            </div>
            <div className="space-y-1">
              {doneTasks.map(task => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl px-3.5 py-2 group transition-colors"
                >
                  <button
                    onClick={() => toggleTask(task.id)}
                    className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                    style={{ background: "#d1fae5" }}
                  >
                    <span className="material-symbols-outlined text-[14px]" style={{ color: "#065f46" }}>check</span>
                  </button>
                  <span
                    className="flex-1 text-[13px] font-medium line-through"
                    style={{ color: "#9ca3af" }}
                  >
                    {task.text}
                  </span>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="מחק"
                  >
                    <span className="material-symbols-outlined text-[13px] hover:text-red-600" style={{ color: "#d1d5db" }}>close</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {data.tasks.length === 0 && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-[36px] mb-2 block" style={{ color: "#d1d5db" }}>task_alt</span>
            <div className="text-[13px] font-semibold" style={{ color: "#9ca3af" }}>
              אין משימות עדיין — הוסף משימה או המר תובנת מערכת
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
