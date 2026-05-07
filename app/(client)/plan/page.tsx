"use client";

/**
 * תוכנית פעולה — יומן ליווי פר-לקוח.
 *
 * מקום פשוט לתעד כל מה שקשור ללקוח: פגישות, תחושות ורגשות,
 * משימות פתוחות לפולואו-אפ ופתקים כלליים. Timeline אחד לפי תאריך.
 */

import { useState, useEffect, useMemo } from "react";
import {
  loadLog,
  saveLog,
  addEntry,
  deleteEntry,
  toggleTask,
  updateEntry,
  sortedLog,
  LOG_TYPE_META,
  CLIENT_LOG_EVENT,
  type LogEntry,
  type LogEntryType,
} from "@/lib/client-log";
import { useClient } from "@/lib/client-context";

const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function formatDateHe(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PlanPage() {
  const { familyName } = useClient();

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | LogEntryType>("all");

  // Composer state
  const [type, setType] = useState<LogEntryType>("meeting");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(todayISO());
  const [composerOpen, setComposerOpen] = useState(false);

  const reload = () => setEntries(loadLog());

  useEffect(() => {
    reload();
    window.addEventListener("storage", reload);
    window.addEventListener(CLIENT_LOG_EVENT, reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener(CLIENT_LOG_EVENT, reload);
    };
  }, []);

  const filtered = useMemo(() => {
    const sorted = sortedLog(entries);
    if (filter === "all") return sorted;
    return sorted.filter((e) => e.type === filter);
  }, [entries, filter]);

  const openTasksCount = entries.filter((e) => e.type === "task" && !e.done).length;
  const meetingsCount = entries.filter((e) => e.type === "meeting").length;

  const handleAdd = () => {
    if (!title.trim()) return;
    addEntry({
      type,
      title: title.trim(),
      body: body.trim() || undefined,
      entryDate: date,
      done: type === "task" ? false : undefined,
    });
    reload();
    setTitle("");
    setBody("");
    setType("meeting");
    setDate(todayISO());
    setComposerOpen(false);
  };

  const handleToggle = (id: string) => {
    toggleTask(id);
    reload();
  };

  const handleDelete = (id: string) => {
    if (!confirm("למחוק את הרשומה?")) return;
    deleteEntry(id);
    reload();
  };

  // Excel export — flat list of all entries (date, type, content, status,
  // attached tags). Uses the dynamic-import xlsx module so it doesn't bloat
  // the page bundle.
  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = sortedLog(entries).map((e) => ({
      תאריך: formatDateHe(e.entryDate),
      סוג: LOG_TYPE_META[e.type]?.label || e.type,
      כותרת: e.title,
      תוכן: e.body || "",
      סטטוס: e.type === "task" ? (e.done ? "בוצע" : "פתוח") : "—",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תוכנית פעולה");
    const fname = `תוכנית-פעולה-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  return (
    <main className="min-h-screen px-10 py-8" style={{ background: "var(--verdant-bg)" }}>
      <div className="mx-auto max-w-4xl">
        {/* Page header removed 2026-04-28 per Nir's request. */}

        {/* Quick stats — 2 KPIs + Excel export */}
        <section className="mb-6 grid grid-cols-3 gap-3">
          <StatCard label="רשומות" value={entries.length} icon="history_edu" />
          <StatCard
            label="משימות פתוחות"
            value={openTasksCount}
            icon="task_alt"
            highlight={openTasksCount > 0}
          />
          <button
            onClick={exportToExcel}
            disabled={entries.length === 0}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{ border: "1px solid #eef2e8", color: "#1B4332" }}
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            <span className="text-sm font-extrabold">ייצוא ל-Excel</span>
          </button>
        </section>

        {/* Composer */}
        <section className="mb-6">
          {!composerOpen ? (
            <button
              onClick={() => setComposerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all"
              style={{ background: "#012D1D", color: "#F9FAF2" }}
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              רשומה חדשה
            </button>
          ) : (
            <div
              className="space-y-4 rounded-2xl p-5"
              style={{ background: "#fff", border: "2px solid #1B433233" }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold" style={{ color: "#012D1D" }}>
                  רשומה חדשה
                </h3>
                <button
                  onClick={() => setComposerOpen(false)}
                  className="text-xs font-bold"
                  style={{ color: "#5a7a6a" }}
                >
                  ביטול
                </button>
              </div>

              {/* Type chips */}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(LOG_TYPE_META) as LogEntryType[]).map((t) => {
                  const meta = LOG_TYPE_META[t];
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
                      style={{
                        background: active ? meta.color : `${meta.color}12`,
                        color: active ? "#F9FAF2" : meta.color,
                        border: active ? `1px solid ${meta.color}` : `1px solid ${meta.color}30`,
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px]">{meta.icon}</span>
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[10px] font-bold" style={{ color: "#5a7a6a" }}>
                    כותרת
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      type === "meeting"
                        ? "למשל: פגישת אבחון שנייה"
                        : type === "feeling"
                          ? "למשל: חשש מהמשכנתא"
                          : type === "task"
                            ? "למשל: להכין דוח מסלקה עד יום שני"
                            : "למשל: הערה למפגש הבא"
                    }
                    className="w-full rounded-lg border px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-verdant-accent/30"
                    style={{ borderColor: "#d8e0d0", background: "#fff", color: "#012D1D" }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold" style={{ color: "#5a7a6a" }}>
                    תאריך
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm font-semibold outline-none"
                    style={{ borderColor: "#d8e0d0", background: "#fff", color: "#012D1D" }}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold" style={{ color: "#5a7a6a" }}>
                  פרטים (אופציונלי)
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="על מה דיברתם, איך הרגשת, מה החלטתם..."
                  className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-verdant-accent/30"
                  style={{ borderColor: "#d8e0d0", background: "#fff", color: "#012D1D" }}
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!title.trim()}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-40"
                  style={{ background: "#1B4332", color: "#F9FAF2" }}
                >
                  שמור רשומה
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Filter tabs */}
        <section className="mb-4 flex flex-wrap items-center gap-2">
          <FilterChip
            label="הכל"
            icon="inbox"
            active={filter === "all"}
            onClick={() => setFilter("all")}
            count={entries.length}
            color="#012D1D"
          />
          {(Object.keys(LOG_TYPE_META) as LogEntryType[]).map((t) => {
            const meta = LOG_TYPE_META[t];
            const count = entries.filter((e) => e.type === t).length;
            return (
              <FilterChip
                key={t}
                label={meta.label}
                icon={meta.icon}
                active={filter === t}
                onClick={() => setFilter(t)}
                count={count}
                color={meta.color}
              />
            );
          })}
        </section>

        {/* Timeline */}
        <section className="space-y-3">
          {filtered.length === 0 ? (
            <div
              className="rounded-2xl py-16 text-center"
              style={{ background: "#fff", border: "1px dashed #d8e0d0" }}
            >
              <span
                className="material-symbols-outlined mb-3 block text-[48px]"
                style={{ color: "#a8bda0" }}
              >
                auto_stories
              </span>
              <div className="mb-1 text-sm font-bold" style={{ color: "#012D1D" }}>
                היומן ריק
              </div>
              <div className="text-xs" style={{ color: "#5a7a6a" }}>
                לחץ על "רשומה חדשה" כדי לתעד את הפגישה הראשונה
              </div>
            </div>
          ) : (
            filtered.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onToggle={() => handleToggle(entry.id)}
                onDelete={() => handleDelete(entry.id)}
                onUpdate={(patch) => {
                  updateEntry(entry.id, patch);
                  reload();
                }}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Sub-components                                                */
/* ═══════════════════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-2xl px-5 py-4"
      style={{
        background: highlight ? "#fffbeb" : "#fff",
        border: `1px solid ${highlight ? "#f59e0b33" : "#d8e0d0"}`,
      }}
    >
      <div>
        <div
          className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em]"
          style={{ color: "#5a7a6a" }}
        >
          {label}
        </div>
        <div
          className="text-2xl font-extrabold tabular-nums"
          style={{ color: highlight ? "#b45309" : "#012D1D" }}
        >
          {value}
        </div>
      </div>
      <span
        className="material-symbols-outlined text-[24px]"
        style={{ color: highlight ? "#b45309" : "#1B4332", opacity: 0.7 }}
      >
        {icon}
      </span>
    </div>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onClick,
  count,
  color,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  count: number;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all"
      style={{
        background: active ? color : `${color}12`,
        color: active ? "#F9FAF2" : color,
        border: `1px solid ${active ? color : `${color}30`}`,
      }}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
      <span className="tabular-nums opacity-70">({count})</span>
    </button>
  );
}

function EntryCard({
  entry,
  onToggle,
  onDelete,
  onUpdate,
}: {
  entry: LogEntry;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<LogEntry>) => void;
}) {
  const meta = LOG_TYPE_META[entry.type];
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editBody, setEditBody] = useState(entry.body ?? "");

  const handleSave = () => {
    onUpdate({ title: editTitle.trim() || entry.title, body: editBody.trim() || undefined });
    setEditing(false);
  };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "#fff",
        border: `1px solid ${meta.color}22`,
        borderInlineStart: `4px solid ${meta.color}`,
        opacity: entry.type === "task" && entry.done ? 0.55 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Type icon / task checkbox */}
        {entry.type === "task" ? (
          <button
            onClick={onToggle}
            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-all"
            style={{
              background: entry.done ? meta.color : "transparent",
              border: `2px solid ${meta.color}`,
            }}
            aria-label={entry.done ? "סמן כלא בוצע" : "סמן כבוצע"}
          >
            {entry.done && (
              <span className="material-symbols-outlined text-[16px]" style={{ color: "#F9FAF2" }}>
                check
              </span>
            )}
          </button>
        ) : (
          <div
            className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${meta.color}15` }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>
              {meta.icon}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            {editing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 rounded border px-2 py-1 text-sm font-bold outline-none"
                style={{ borderColor: meta.color, color: "#012D1D" }}
              />
            ) : (
              <div
                className="flex-1 text-sm font-extrabold"
                style={{
                  color: "#012D1D",
                  textDecoration: entry.type === "task" && entry.done ? "line-through" : "none",
                }}
              >
                {entry.title}
              </div>
            )}
            <div
              className="flex-shrink-0 text-[10px] font-bold tabular-nums"
              style={{ color: "#5a7a6a" }}
            >
              {formatDateHe(entry.entryDate)}
            </div>
          </div>

          {/* Type label */}
          <div
            className="mb-2 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: meta.color }}
          >
            {meta.label}
          </div>

          {/* Body */}
          {editing ? (
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              className="mb-2 w-full resize-none rounded border px-2 py-1.5 text-sm outline-none"
              style={{ borderColor: "#d8e0d0", color: "#012D1D" }}
            />
          ) : (
            entry.body && (
              <div
                className="whitespace-pre-wrap text-[13px] leading-relaxed"
                style={{ color: "#3a4a40" }}
              >
                {entry.body}
              </div>
            )
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="rounded px-2 py-1 text-xs font-bold"
                style={{ background: meta.color, color: "#F9FAF2" }}
              >
                שמור
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditTitle(entry.title);
                  setEditBody(entry.body ?? "");
                }}
                className="rounded px-2 py-1 text-xs font-bold"
                style={{ color: "#5a7a6a" }}
              >
                בטל
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-black/5"
                title="ערוך"
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ color: "#5a7a6a" }}
                >
                  edit
                </span>
              </button>
              <button
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-red-50"
                title="מחק"
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ color: "#b91c1c" }}
                >
                  delete
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
