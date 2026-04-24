/**
 * Client log — per-client journal of meetings, feelings, notes, tasks.
 *
 * Simple append-only timeline used on /plan. Each entry is typed so the
 * advisor can later filter or report on a specific kind.
 *
 * Per-client localStorage key: `verdant:client_log`.
 */

import { scopedKey } from "@/lib/client-scope";

export type LogEntryType = "meeting" | "feeling" | "task" | "note";

export interface LogEntry {
  id: string;
  /** ISO timestamp when the entry was created. */
  createdAt: string;
  /** ISO date (yyyy-mm-dd) the entry refers to — may differ from createdAt. */
  entryDate: string;
  type: LogEntryType;
  title: string;
  body?: string;
  /** Task-only: marks a task as done. */
  done?: boolean;
}

const STORAGE_KEY = "verdant:client_log";
export const CLIENT_LOG_EVENT = "verdant:client_log:updated";

export const LOG_TYPE_META: Record<LogEntryType, { label: string; icon: string; color: string }> = {
  meeting: { label: "פגישה",       icon: "event",          color: "#1B4332" },
  feeling: { label: "תחושה / רגש", icon: "psychology",     color: "#7c3aed" },
  task:    { label: "משימה",       icon: "task_alt",       color: "#b45309" },
  note:    { label: "פתק",         icon: "sticky_note_2",  color: "#5a7a6a" },
};

export function loadLog(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLog(entries: LogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(entries));
    window.dispatchEvent(new Event(CLIENT_LOG_EVENT));
  } catch {}
}

export function addEntry(entry: Omit<LogEntry, "id" | "createdAt">): LogEntry {
  const full: LogEntry = {
    id: "l" + Math.random().toString(36).slice(2, 9),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  const all = loadLog();
  all.unshift(full); // newest first
  saveLog(all);
  return full;
}

export function updateEntry(id: string, patch: Partial<LogEntry>): void {
  const all = loadLog();
  const next = all.map(e => (e.id === id ? { ...e, ...patch } : e));
  saveLog(next);
}

export function deleteEntry(id: string): void {
  const all = loadLog();
  saveLog(all.filter(e => e.id !== id));
}

export function toggleTask(id: string): void {
  const all = loadLog();
  const next = all.map(e => (e.id === id && e.type === "task" ? { ...e, done: !e.done } : e));
  saveLog(next);
}

/** Sort by entryDate DESC, falling back to createdAt. */
export function sortedLog(entries: LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => {
    const da = a.entryDate || a.createdAt.slice(0, 10);
    const db = b.entryDate || b.createdAt.slice(0, 10);
    if (da !== db) return db.localeCompare(da);
    return b.createdAt.localeCompare(a.createdAt);
  });
}
