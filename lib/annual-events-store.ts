/**
 * Annual events store — one-off income/expense items the household
 * expects this year. Examples: a 13th-salary bonus in November, a
 * holiday trip in August, annual property tax in January.
 *
 * Where this fits:
 *   - Recurring monthly inputs (salary, passive, debt service) come
 *     from their existing stores.
 *   - Variable spend is projected from current month's pace.
 *   - This store fills the GAP that Riseup explicitly fails at —
 *     seasonal one-offs that distort cashflow when a single month is
 *     compared in isolation.
 *
 * The mobile cashflow forecast (lib/forecast-engine) reads from here.
 * For now editing happens inside the mobile forecast view; a richer
 * desktop form is a separate iteration.
 */

import { scopedKey } from "./client-scope";
import { safeSetItem } from "@/lib/safe-storage";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

export type AnnualEventKind = "income" | "expense";

export interface AnnualEvent {
  /** Stable id for diff/delete operations. */
  id: string;
  /** Calendar year the event belongs to. */
  year: number;
  /** 1–12 (Jan = 1). */
  month: number;
  kind: AnnualEventKind;
  /** Positive amount in ILS. */
  amount: number;
  /** Hebrew label, e.g. "משכורת 13", "חופשה לאיים", "ארנונה שנתית". */
  label: string;
  /** Optional notes. */
  notes?: string;
  /** Set by saveAnnualEvents — used for sync conflict resolution. */
  updatedAt?: string;
}

const BLOB_KEY = "annual_events";
const STORAGE_EVENT = "verdant:annual_events:updated";

/* ─────────────────────────────────────────────── */
/* Storage key per year                            */
/* ─────────────────────────────────────────────── */

function storageKey(year: number): string {
  return `verdant:annual_events_${year}`;
}

/* ─────────────────────────────────────────────── */
/* CRUD                                            */
/* ─────────────────────────────────────────────── */

export function loadAnnualEvents(year: number): AnnualEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(storageKey(year)));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as AnnualEvent[])
      .filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.month === "number" &&
          e.month >= 1 &&
          e.month <= 12 &&
          (e.kind === "income" || e.kind === "expense") &&
          typeof e.amount === "number" &&
          e.amount > 0
      )
      .sort((a, b) => a.month - b.month);
  } catch {
    return [];
  }
}

/** All events from current year + next year (so a forecast that crosses
 *  into next year picks up next-year events too). */
export function loadAnnualEventsRolling(monthsAhead = 12): AnnualEvent[] {
  const now = new Date();
  const startYear = now.getFullYear();
  // Need at most 2 years of coverage (current + next).
  const endYear = startYear + (now.getMonth() + monthsAhead > 11 ? 1 : 0);
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years.flatMap((y) => loadAnnualEvents(y));
}

export function saveAnnualEvents(year: number, events: AnnualEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    const stamped = events.map((e) => ({
      ...e,
      updatedAt: e.updatedAt ?? new Date().toISOString(),
    }));
    safeSetItem(scopedKey(storageKey(year)), JSON.stringify(stamped));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    // Blob sync — one blob per year so the desktop can show the same data.
    pushBlobInBackground(`${BLOB_KEY}_${year}`, stamped);
  } catch (err) {
    console.warn("[annual-events] save failed:", err);
  }
}

export function addAnnualEvent(year: number, event: Omit<AnnualEvent, "id" | "year" | "updatedAt">): AnnualEvent {
  const events = loadAnnualEvents(year);
  const newEvent: AnnualEvent = {
    ...event,
    id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    year,
    updatedAt: new Date().toISOString(),
  };
  saveAnnualEvents(year, [...events, newEvent]);
  return newEvent;
}

export function updateAnnualEvent(
  year: number,
  id: string,
  patch: Partial<Omit<AnnualEvent, "id" | "year">>
): void {
  const events = loadAnnualEvents(year);
  const next = events.map((e) =>
    e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
  );
  saveAnnualEvents(year, next);
}

export function removeAnnualEvent(year: number, id: string): void {
  const events = loadAnnualEvents(year);
  saveAnnualEvents(year, events.filter((e) => e.id !== id));
}

/** Bootstrap pull — called from sync/bootstrap.ts so the mobile loads the
 *  events the dashboard saved before rendering the forecast. We pull
 *  current + next year separately. */
export async function hydrateAnnualEventsFromRemote(): Promise<void> {
  const now = new Date();
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    try {
      const remote = await pullBlob<AnnualEvent[]>(`${BLOB_KEY}_${y}`);
      if (!Array.isArray(remote)) continue;
      safeSetItem(scopedKey(storageKey(y)), JSON.stringify(remote));
    } catch {
      /* offline — keep local data */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }
}

export const ANNUAL_EVENTS_EVENT = STORAGE_EVENT;
