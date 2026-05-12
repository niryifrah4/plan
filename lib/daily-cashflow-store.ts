/**
 * Daily cashflow store — per-day events for the checking account.
 *
 * The monthly budget shows totals; this layer answers "on which DAY do we
 * go under?" — the question Nir's Excel template solves with its bottom-
 * of-sheet "בדיקת תזרים בעו"ש" block. A salary that arrives on the 5th
 * but credit-card charges that hit on the 10th and 28th can hide an
 * overdraft in the middle of the month even when the monthly total is
 * positive.
 *
 * Events are recurring by definition: each entry has a dayOfMonth (1–31)
 * and an amount (negative = charge, positive = income). The trajectory
 * helper walks day-by-day from the opening balance, applying events on
 * their assigned day, and reports the minimum balance + the day it hits.
 *
 * Storage: localStorage only (cache-style). Source of truth lives in
 * Supabase blob sync just like debt/budget stores.
 */

import { scopedKey } from "./client-scope";

export interface DailyEvent {
  id: string;
  label: string; // free text, e.g. "משכורת בעל", "ויזה כאל"
  dayOfMonth: number; // 1–31; clamped to month length at runtime
  amount: number; // signed: positive = income, negative = expense
  source?: string; // optional bank / card identifier
  notes?: string;
}

export interface DailyCashflow {
  /** Current checking-account balance (today's snapshot). */
  openingBalance: number;
  /** Alert level — warn when projected balance drops below this. */
  threshold: number;
  /** Bank-approved overdraft line (₪). Optional. When set, the chart paints
   *  a 3-zone story (in-frame minus / approved-minus / over-frame) instead
   *  of treating all negative as the same red. Per finance-agent 2026-05-12:
   *  a couple in a routine ₪-2,000 inside their ₪10,000 frame is in a very
   *  different place than a couple hitting the frame ceiling. */
  creditLine?: number;
  /** Recurring monthly events. */
  events: DailyEvent[];
}

const STORAGE_KEY = "verdant:daily_cashflow_v1";
export const DAILY_CASHFLOW_EVENT = "verdant:daily-cashflow:updated";

const DEFAULT_DATA: DailyCashflow = {
  openingBalance: 0,
  threshold: 1000,
  creditLine: 0,
  events: [],
};

export function loadDailyCashflow(): DailyCashflow {
  if (typeof window === "undefined") return DEFAULT_DATA;
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return DEFAULT_DATA;
    const parsed = JSON.parse(raw) as DailyCashflow;
    return {
      openingBalance: Number(parsed.openingBalance) || 0,
      threshold: Number(parsed.threshold) || 1000,
      creditLine: Number(parsed.creditLine) || 0,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return DEFAULT_DATA;
  }
}

export function saveDailyCashflow(data: DailyCashflow): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(data));
    window.dispatchEvent(new CustomEvent(DAILY_CASHFLOW_EVENT));
  } catch (e) {
    console.warn("[daily-cashflow-store] save failed:", e);
  }
}

export function newEventId(): string {
  return "dc-" + Math.random().toString(36).slice(2, 9);
}

export interface DailyPoint {
  day: number; // 1-31 within the current month
  balance: number; // projected balance at end of this day
  events: DailyEvent[]; // events that hit this day (for tooltips)
}

export interface TrajectoryResult {
  points: DailyPoint[];
  minBalance: number;
  minDay: number;
  /** Days where projected balance dipped below the threshold. */
  daysBelowThreshold: number;
  /** Days where the balance was below zero (true minus, regardless of frame). */
  daysBelowZero: number;
  /** Days that broke through the approved overdraft line (only meaningful when
   *  creditLine > 0). */
  daysOverFrame: number;
  /** Average daily balance across the month — the "ממוצע יתרה חודשי" that a CFP
   *  uses to gauge breathing room separate from worst-case timing. */
  averageBalance: number;
  /** Sum of all negative recurring outflows in the month. Used to size a
   *  recommended buffer (~half of this is the CFP rule-of-thumb). */
  totalRecurringOutflows: number;
  endingBalance: number;
}

/**
 * Project the checking-account balance day-by-day across the current month.
 * Income events add to the balance on their day; expense events subtract.
 * Days past month length are clamped to the last day of the month, so an
 * event scheduled for "31" in a 30-day month still applies on day 30.
 */
export function buildTrajectory(
  data: DailyCashflow,
  monthLength: number = daysInCurrentMonth()
): TrajectoryResult {
  const eventsByDay = new Map<number, DailyEvent[]>();
  for (const ev of data.events) {
    const day = Math.min(monthLength, Math.max(1, Math.round(ev.dayOfMonth)));
    const list = eventsByDay.get(day) || [];
    list.push(ev);
    eventsByDay.set(day, list);
  }

  const points: DailyPoint[] = [];
  let balance = data.openingBalance;
  // 2026-05-12 per finance-agent: seed minDay to 1 so the chart marker and
  // the KPI hint both have a sensible value when the worst day IS day-1
  // (e.g. balance only ever rises after a single payday at start of month).
  let minBalance = balance;
  let minDay = 1;
  let daysBelowThreshold = 0;
  let daysBelowZero = 0;
  let daysOverFrame = 0;
  let balanceSum = 0;
  let totalRecurringOutflows = 0;
  const frameFloor = -(data.creditLine || 0);

  for (let day = 1; day <= monthLength; day++) {
    const dayEvents = eventsByDay.get(day) || [];
    for (const ev of dayEvents) {
      balance += ev.amount;
      if (ev.amount < 0) totalRecurringOutflows += -ev.amount;
    }
    if (balance < minBalance) {
      minBalance = balance;
      minDay = day;
    }
    if (balance < data.threshold) daysBelowThreshold++;
    if (balance < 0) daysBelowZero++;
    if (balance < frameFloor) daysOverFrame++;
    balanceSum += balance;
    points.push({ day, balance, events: dayEvents });
  }

  return {
    points,
    minBalance,
    minDay,
    daysBelowThreshold,
    daysBelowZero,
    daysOverFrame,
    averageBalance: Math.round(balanceSum / Math.max(1, monthLength)),
    totalRecurringOutflows: Math.round(totalRecurringOutflows),
    endingBalance: balance,
  };
}

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}
