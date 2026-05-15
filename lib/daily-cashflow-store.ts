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
import { loadAccounts } from "./accounts-store";
import { loadDebtData } from "./debt-store";
import { getMonthlyNetIncome } from "./income";

export interface DailyEvent {
  id: string;
  label: string; // free text, e.g. "משכורת בעל", "ויזה כאל"
  dayOfMonth: number; // 1–31; clamped to month length at runtime
  amount: number; // signed: positive = income, negative = expense
  source?: string; // optional bank / card identifier
  notes?: string;
  /** Origin tag — "manual" means user-entered, otherwise this event is
   *  auto-derived from another store and is read-only in the table. */
  origin?: "manual" | "card";
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
  /** Day of month payroll lands. When set, the daily projection auto-credits
   *  the monthly net income (read live from the income module) on that day,
   *  so the user doesn't have to enter "משכורת" as a manual recurring event.
   *  (2026-05-13 per Nir.) */
  salaryDayOfMonth?: number;
  /** Recurring monthly events. */
  events: DailyEvent[];
}

const STORAGE_KEY = "verdant:daily_cashflow_v1";
export const DAILY_CASHFLOW_EVENT = "verdant:daily-cashflow:updated";

const DEFAULT_DATA: DailyCashflow = {
  openingBalance: 0,
  threshold: 1000,
  creditLine: 0,
  salaryDayOfMonth: 0,
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
      salaryDayOfMonth: Number(parsed.salaryDayOfMonth) || 0,
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

/**
 * Auto-derived events from other stores — credit cards charge their accumulated
 * basket on their billingDay. (2026-05-12 stage 1: card-as-entity model.)
 *
 * Why this matters: the family already maintains their cards in /balance →
 * Accounts. Forcing them to re-type the same charges into the daily cashflow
 * is exactly the "double entry" that made the Excel template painful. Now the
 * daily view automatically reflects what's been entered on the card.
 *
 * Each card produces ONE expense event per month on its billingDay, summing:
 *   - currentCharge       (the basket — variable spend already accumulated)
 *   - sum of installments (recurring multi-payment commitments)
 * The card's installments are matched by Installment.source containing the
 * card identifier. Installments not matched to any card stay as a separate
 * fallback event so they still appear in the projection.
 */
export function buildAutoEvents(salaryDay?: number): DailyEvent[] {
  if (typeof window === "undefined") return [];
  const accounts = loadAccounts();
  const debt = loadDebtData();
  const activeInstallments = (debt.installments || []).filter(
    (i) => i.currentPayment <= i.totalPayments
  );

  // Track which installments got attached to a card so the fallback bucket
  // (installments-without-a-card) doesn't double-count them.
  const matchedInstallmentIds = new Set<string>();

  const events: DailyEvent[] = [];

  for (const card of accounts.creditCards || []) {
    if (!card.billingDay || card.billingDay < 1 || card.billingDay > 31) continue;

    // Match installments to this card. Source field is free text the user
    // typed (often "ויזה כאל" or "כאל 1234"); we match loosely by checking
    // whether the card name appears in source OR the last4 digits appear.
    const cardName = (card.company || "").toLowerCase();
    const last4 = card.lastFourDigits || "";
    const cardInstallments = activeInstallments.filter((inst) => {
      const src = (inst.source || "").toLowerCase();
      if (!src) return false;
      if (cardName && src.includes(cardName)) return true;
      if (last4 && src.includes(last4)) return true;
      return false;
    });
    cardInstallments.forEach((i) => matchedInstallmentIds.add(i.id));
    const installmentsSum = cardInstallments.reduce((s, i) => s + (i.monthlyAmount || 0), 0);

    const totalCharge = (card.currentCharge || 0) + installmentsSum;
    if (totalCharge <= 0) continue; // nothing to project

    const label =
      card.company && card.lastFourDigits
        ? `${card.company} ••${card.lastFourDigits}`
        : card.company || "כרטיס אשראי";

    events.push({
      id: `auto-card-${card.id}`,
      label,
      dayOfMonth: card.billingDay,
      amount: -totalCharge,
      source: `card:${card.id}`,
      origin: "card",
      notes:
        installmentsSum > 0
          ? `סל מצטבר ${Math.round(card.currentCharge || 0).toLocaleString()} + תשלומים ${Math.round(installmentsSum).toLocaleString()}`
          : undefined,
    });
  }

  // Salary auto-credit: when the user has declared a payday, drop the
  // monthly net income onto that day. Sourced from getMonthlyNetIncome()
  // (the single source of truth for net) so a salary change anywhere in
  // the system flows through.
  if (salaryDay && salaryDay >= 1 && salaryDay <= 31) {
    const monthlyNet = getMonthlyNetIncome();
    if (monthlyNet > 0) {
      events.push({
        id: "auto-salary",
        label: "משכורת (נטו)",
        dayOfMonth: salaryDay,
        amount: Math.round(monthlyNet),
        origin: "card",
        source: "salary",
      });
    }
  }

  return events;
}

export interface DailyPoint {
  /** Index 1..N across the whole window — useful for charting on a continuous
   *  x-axis. */
  index: number;
  /** Day of month (1..28-31), repeats each month. */
  day: number;
  /** YYYY-MM the day belongs to. */
  ym: string;
  /** Hebrew month label, e.g. "מאי 2026". */
  monthLabel: string;
  /** Projected balance at end of this day. */
  balance: number;
  /** Events that hit this day (for tooltips). */
  events: DailyEvent[];
}

export interface TrajectoryResult {
  points: DailyPoint[];
  minBalance: number;
  /** Day of month where minimum sits (1-31). Within the FIRST month of the
   *  window — keeps the existing KPI "ה-21 לחודש" hint readable. */
  minDay: number;
  /** 1-based position of the minimum in the points array — used to place the
   *  marker on the chart regardless of how many months the window spans. */
  minIndex: number;
  /** Human label for the lowest point, e.g. "21 ביוני 2026". Useful when
   *  the window spans multiple months and the minimum is far away. */
  minLabel: string;
  /** Days where projected balance dipped below the threshold. */
  daysBelowThreshold: number;
  /** Days where the balance was below zero (true minus, regardless of frame). */
  daysBelowZero: number;
  /** Days that broke through the approved overdraft line (only meaningful when
   *  creditLine > 0). */
  daysOverFrame: number;
  /** Average daily balance across the window. */
  averageBalance: number;
  /** Sum of all negative recurring outflows in a single month. Used to size
   *  the recommended buffer (~half of this is the CFP rule-of-thumb). Stays
   *  month-scoped even when the window spans multiple months. */
  totalRecurringOutflows: number;
  endingBalance: number;
  /** Number of months projected (1, 3, 6, 12). */
  monthsProjected: number;
}

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

/**
 * Project the checking-account balance day-by-day. Each recurring event
 * (manual + auto-derived) fires every month on its assigned day.
 *
 * `monthsAhead` defaults to 1 (current month only). Set 3/6/12 to extend
 * the window — the trajectory stays continuous (no balance reset between
 * months), so the user sees the actual rhythm of their cashflow rather
 * than a fresh start each month.
 *
 * Events scheduled for day 31 in a 30-day month still apply on day 30 of
 * that month, then back to 31 in the next 31-day month.
 */
export function buildTrajectory(
  data: DailyCashflow,
  monthsAhead: number = 1
): TrajectoryResult {
  const manualEvents: DailyEvent[] = data.events.map((e) => ({
    ...e,
    origin: e.origin || "manual",
  }));
  const autoEvents = buildAutoEvents(data.salaryDayOfMonth);
  const allEvents = [...manualEvents, ...autoEvents];

  const points: DailyPoint[] = [];
  let balance = data.openingBalance;
  let minBalance = balance;
  let minIndex = 1;
  let daysBelowThreshold = 0;
  let daysBelowZero = 0;
  let daysOverFrame = 0;
  let balanceSum = 0;
  const frameFloor = -(data.creditLine || 0);

  // Total recurring outflows for ONE month — basis of the buffer recommendation.
  // We compute once from allEvents, not by accumulating across the window.
  const totalRecurringOutflows = Math.round(
    allEvents.reduce((s, e) => (e.amount < 0 ? s + -e.amount : s), 0)
  );

  const now = new Date();
  let firstMonthDays = 0;
  let firstMonthMinDay = 1;

  let runningIndex = 0;
  for (let monthOffset = 0; monthOffset < monthsAhead; monthOffset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLength = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (monthOffset === 0) firstMonthDays = monthLength;

    // Rebuild eventsByDay each month so "day 31" maps correctly per month.
    const eventsByDay = new Map<number, DailyEvent[]>();
    for (const ev of allEvents) {
      const day = Math.min(monthLength, Math.max(1, Math.round(ev.dayOfMonth)));
      const list = eventsByDay.get(day) || [];
      list.push(ev);
      eventsByDay.set(day, list);
    }

    for (let day = 1; day <= monthLength; day++) {
      runningIndex++;
      const dayEvents = eventsByDay.get(day) || [];
      for (const ev of dayEvents) balance += ev.amount;
      if (balance < minBalance) {
        minBalance = balance;
        minIndex = runningIndex;
        if (monthOffset === 0) firstMonthMinDay = day;
      }
      if (balance < data.threshold) daysBelowThreshold++;
      if (balance < 0) daysBelowZero++;
      if (balance < frameFloor) daysOverFrame++;
      balanceSum += balance;
      points.push({ index: runningIndex, day, ym, monthLabel, balance, events: dayEvents });
    }
  }

  // Friendly label for the lowest point ("21 ביוני 2026").
  const minPoint = points.find((p) => p.index === minIndex);
  const minLabel = minPoint ? `${minPoint.day} ב${minPoint.monthLabel}` : "";

  return {
    points,
    minBalance,
    // Keep minDay = the day-of-month inside the FIRST month so KPI hints stay
    // readable for single-month users. multi-month users get minLabel.
    minDay: firstMonthMinDay && firstMonthDays > 0 ? firstMonthMinDay : 1,
    minIndex,
    minLabel,
    daysBelowThreshold,
    daysBelowZero,
    daysOverFrame,
    averageBalance: Math.round(balanceSum / Math.max(1, points.length)),
    totalRecurringOutflows,
    endingBalance: balance,
    monthsProjected: monthsAhead,
  };
}
