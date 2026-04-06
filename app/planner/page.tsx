"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtILS } from "@/lib/format";

/* ===== Demo Data ===== */
const CLIENTS = [
  { family: "משפחת יפרח",   step: 2, totalSteps: 3, netWorth: 1240000, trend: "+4.2%", members: 4, joined: "01/2026", docsUploaded: 12, docsTotal: 15 },
  { family: "משפחת אברהם", step: 1, totalSteps: 3, netWorth:  820000, trend: "+1.1%", members: 3, joined: "02/2026", docsUploaded: 4,  docsTotal: 10 },
  { family: "משפחת גולן",   step: 3, totalSteps: 3, netWorth: 2860000, trend: "+6.8%", members: 5, joined: "11/2025", docsUploaded: 18, docsTotal: 18 },
  { family: "משפחת כהן",    step: 2, totalSteps: 3, netWorth:  950000, trend: "+2.8%", members: 3, joined: "12/2025", docsUploaded: 8,  docsTotal: 12 },
];

const MEETINGS = [
  { time: "09:30", client: "משפחת כהן",    type: "בניית תוכנית", duration: 60, color: "#0a7a4a" },
  { time: "11:00", client: "רונית כהן",    type: "אבחון",        duration: 45, color: "#10b981" },
  { time: "14:00", client: "משפחת אברהם", type: "בניית תוכנית", duration: 90, color: "#0a7a4a" },
  { time: "16:30", client: "משפחת לוי",    type: "פרישה",        duration: 60, color: "#012d1d" },
];

const DEFAULT_TASKS = [
  { id: 1, text: "פולואו-אפ: רונית כהן (ליד חדש)",       source: "lead",   client: null,          done: false },
  { id: 2, text: "הפקת דוח מסלקה - משפחת כהן",          source: "client", client: "משפחת כהן",   done: false },
  { id: 3, text: "הכנת תוכנית עבודה - משפחת אברהם",     source: "client", client: "משפחת אברהם", done: false },
  { id: 4, text: "תגובה ללידים של פייסבוק (סוף שבוע)",  source: "lead",   client: null,          done: false },
  { id: 5, text: "עדכון דוחות חודשיים ללקוחות פעילים",   source: "general",client: null,          done: false },
  { id: 6, text: "קביעת פגישה עם משפחת גולן לרבעון הבא", source: "client", client: "משפחת גולן", done: true },
  { id: 7, text: "עדכון CRM - סטטוסים של השבוע",         source: "general",client: null,          done: false },
];

const SOURCE_META: Record<string, { label: string; color: string }> = {
  lead:    { label: "מתעניין", color: "#10b981" },
  client:  { label: "לקוח",    color: "#0a7a4a" },
  general: { label: "כללי",    color: "#5a7a6a" },
};

export default function PlannerPage() {
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [newTask, setNewTask] = useState("");
  const [newSource, setNewSource] = useState("general");

  const hour = new Date().getHours();
  const greet = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : hour < 20 ? "ערב טוב" : "לילה טוב";
  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const openTasks = tasks.filter((t) => !t.done).length;

  function toggle(id: number) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }
  function remove(id: number) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }
  function addTask() {
    if (!newTask.trim()) return;
    const id = Math.max(0, ...tasks.map((t) => t.id)) + 1;
    setTasks((prev) => [...prev, { id, text: newTask.trim(), source: newSource, client: null, done: false }]);
    setNewTask("");
  }

  return (
    <main className="min-h-screen px-10 py-8" style={{ background: "var(--verdant-bg)" }}>
      <div className="max-w-6xl mx-auto">
        {/* Greeting */}
        <header className="mb-8 pb-6 border-b v-divider flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-verdant-muted font-bold mb-3">Advisor Lobby · מרכז פיקוד</div>
            <h1 className="text-2xl font-bold text-verdant-ink tracking-tight leading-tight">שלום, ניר — {greet}</h1>
            <p className="text-xs text-verdant-muted mt-1.5">{today}</p>
          </div>
          <button
            className="text-white font-bold text-sm py-2.5 px-5 rounded-lg transition-transform hover:scale-[0.98] flex items-center gap-2"
            style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}
          >
            <span className="material-symbols-outlined text-[18px]">add_task</span>
            משימה מהירה
          </button>
        </header>

        {/* Quick Stats */}
        <section className="grid grid-cols-3 gap-4 mb-8">
          <div className="v-card p-5 group hover:border-verdant-emerald transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">מתעניינים חדשים</div>
              <span className="material-symbols-outlined text-verdant-emerald text-[18px] opacity-60 group-hover:opacity-100 transition-opacity">person_add</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-extrabold text-verdant-ink tracking-tight">2</div>
              <div className="text-[11px] text-verdant-muted font-semibold">השבוע</div>
            </div>
          </div>
          <div className="v-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">משימות פתוחות</div>
              <span className="material-symbols-outlined text-verdant-emerald text-[18px] opacity-60">checklist</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-extrabold text-verdant-ink tracking-tight">{openTasks}</div>
              <div className="text-[11px] text-verdant-muted font-semibold">להיום</div>
            </div>
          </div>
          <div className="v-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">פגישות היום</div>
              <span className="material-symbols-outlined text-verdant-emerald text-[18px] opacity-60">event</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-extrabold text-verdant-ink tracking-tight">{MEETINGS.length}</div>
              <div className="text-[11px] text-verdant-muted font-semibold">מתוזמנות</div>
            </div>
          </div>
        </section>

        {/* Client List */}
        <section className="v-card overflow-hidden mb-8">
          <div className="px-6 py-4 border-b v-divider flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">לקוחות פעילים</div>
              <h3 className="text-base font-bold text-verdant-ink">ניהול תיקי לקוחות</h3>
            </div>
            <span className="text-xs text-verdant-muted font-semibold">{CLIENTS.length} תיקים</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-verdant-muted font-bold" style={{ background: "#f4f7ed" }}>
                <th className="text-right px-6 py-3">משפחה</th>
                <th className="text-right px-3 py-3">שלב</th>
                <th className="text-right px-3 py-3">הון נקי</th>
                <th className="text-right px-3 py-3">מגמה</th>
                <th className="text-right px-3 py-3">מסמכים</th>
                <th className="text-right px-3 py-3">הצטרפות</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {CLIENTS.map((c) => {
                const docPct = Math.round((c.docsUploaded / c.docsTotal) * 100);
                return (
                  <tr key={c.family} className="border-b v-divider hover:bg-[#f9faf2] transition-colors">
                    <td className="px-6 py-3 font-extrabold text-verdant-ink">{c.family}</td>
                    <td className="px-3 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#0a7a4a15", color: "#0a7a4a" }}>
                        שלב {c.step}/{c.totalSteps}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular font-bold">{fmtILS(c.netWorth)}</td>
                    <td className="px-3 py-3 font-bold" style={{ color: c.trend.startsWith("+") ? "#0a7a4a" : "#b91c1c" }}>{c.trend}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
                          <div className="h-full rounded-full" style={{ width: `${docPct}%`, background: docPct === 100 ? "#10b981" : "#0a7a4a" }} />
                        </div>
                        <span className="text-[10px] font-bold text-verdant-muted">{c.docsUploaded}/{c.docsTotal}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-verdant-muted font-bold">{c.joined}</td>
                    <td className="px-3 py-3">
                      <Link
                        href="/dashboard"
                        className="text-[11px] font-extrabold text-verdant-emerald hover:underline"
                      >
                        פתח תיק ←
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Tasks + Meetings bento */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Tasks */}
          <div className="v-card p-6 lg:col-span-3">
            <div className="flex items-center justify-between mb-5 pb-3 border-b v-divider">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">ריכוז משימות</div>
                <h3 className="text-base font-bold text-verdant-ink">סדר היום · להיום</h3>
              </div>
            </div>
            <ul className="divide-y v-divider">
              {tasks.map((t) => {
                const meta = SOURCE_META[t.source] ?? SOURCE_META.general;
                return (
                  <li key={t.id} className={`flex items-center gap-3 py-2 px-2 transition-colors hover:bg-[#f9faf2] ${t.done ? "opacity-50" : ""}`}>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggle(t.id)}
                      className="w-4 h-4 rounded border-verdant-muted accent-verdant-emerald flex-shrink-0"
                    />
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                    <span className={`text-sm text-verdant-ink flex-1 truncate ${t.done ? "line-through text-verdant-muted" : ""}`}>{t.text}</span>
                    {t.client && (
                      <Link href="/dashboard" className="text-[10px] font-bold text-verdant-emerald hover:underline whitespace-nowrap">
                        {t.client} →
                      </Link>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-verdant-muted min-w-[50px] text-left">{meta.label}</span>
                    <button onClick={() => remove(t.id)} className="text-verdant-muted hover:text-red-500 transition-colors">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 pt-3 border-t v-divider">
              <form
                onSubmit={(e) => { e.preventDefault(); addTask(); }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="הוסף משימה חדשה..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-verdant-ink placeholder:text-verdant-muted"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                />
                <select
                  className="text-[11px] font-bold bg-transparent border rounded px-2 py-1 text-verdant-muted outline-none"
                  style={{ borderColor: "var(--verdant-line)" }}
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                >
                  <option value="general">כללי</option>
                  <option value="lead">מתעניין</option>
                  <option value="client">לקוח</option>
                </select>
                <button type="submit" className="text-xs font-bold px-3 py-1.5 rounded text-verdant-emerald hover:bg-verdant-emerald hover:text-white transition-colors" style={{ background: "#eef7f1" }}>
                  הוסף
                </button>
              </form>
            </div>
          </div>

          {/* Meetings */}
          <div className="v-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-5 pb-3 border-b v-divider">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold mb-1">יומן פגישות</div>
                <h3 className="text-base font-bold text-verdant-ink">סדר היום שלי</h3>
              </div>
              <span className="text-[10px] font-bold text-verdant-muted uppercase tracking-wider">Calendar API</span>
            </div>
            <ul className="space-y-3">
              {MEETINGS.map((m, i) => (
                <li key={i} className="flex items-start gap-3 pb-3 border-b v-divider last:border-0 last:pb-0 group cursor-pointer hover:bg-[#f9faf2] -mx-2 px-2 py-1 rounded transition-colors">
                  <div className="text-right min-w-[52px]">
                    <div className="text-sm font-bold text-verdant-ink tabular">{m.time}</div>
                    <div className="text-[10px] text-verdant-muted font-semibold">{m.duration} דק&apos;</div>
                  </div>
                  <div className="w-0.5 self-stretch rounded-full" style={{ background: m.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-verdant-ink truncate">{m.client}</div>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] mt-1"
                      style={{ background: `${m.color}15`, color: m.color }}
                    >
                      {m.type}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-verdant-muted opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">
                    arrow_back
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
