/**
 * insights-engine — proactive nudges for the /m mobile home page.
 *
 * The agent ("Deep recommendations engine spec", 2026-05-23) designed
 * seven rules covering the most common Israeli-household failure modes:
 * overspending pace, surplus-vs-overflow, loan endings, late check-ins,
 * negative net, missed goal targets, and stale net-worth snapshots.
 *
 * Design rules baked in:
 *   - At most ONE insight is shown at a time, picked by priority.
 *   - Silence is valid — if no rule fires, return null and render nothing.
 *   - Dismissed insights stay quiet for 3 days, then re-evaluate.
 *   - Every insight describes a concrete one-tap action.
 *   - No vague predictions — fires only on hard data.
 *
 * Everything reads from existing stores. No new collection points.
 */

import { buildBudgetLines, type BudgetLine } from "./budget-store";
import {
  loadDebtData,
  isLoanActive,
  loanElapsedMonths,
  type Loan,
} from "./debt-store";
import { loadBuckets } from "./buckets-store";
import type { Bucket } from "./_shared/buckets-core";
import {
  loadHistory,
  type NetWorthSnapshot,
} from "./balance-history-store";
import { householdNetSalary } from "./salary-engine";
import { getPassiveIncomeSummary } from "./passive-income";
import { getDebtSummary } from "./debt-store";
import { scopedKey } from "./client-scope";

/* ─────────────────────────────────────────────── */
/* Types                                           */
/* ─────────────────────────────────────────────── */

export type InsightKind =
  | "negative_cashflow"
  | "pace_warning"
  | "goal_target_miss"
  | "loan_ending"
  | "goal_behind"
  | "surplus_overflow"
  | "stale_snapshot";

export type InsightActionTarget =
  | "add_expense"
  | "category"
  | "goals"
  | "goal_check_in"
  | "edit_category"
  | "balance";

export interface Insight {
  /** Unique per-occurrence id used as the dismiss key. Built from the
   *  kind + identifying month/category/goal so a dismiss for May food
   *  doesn't suppress June food. */
  id: string;
  kind: InsightKind;
  /** Lower = higher priority. Agent's order. */
  priority: number;
  /** Hebrew body — 1–2 sentences, no jargon. */
  body: string;
  /** Optional Hebrew prefix used as an in-card eyebrow (always short). */
  eyebrow?: string;
  action: {
    label: string;
    target: InsightActionTarget;
    /** Optional id payload — category key, goal id, etc. */
    payload?: string;
  };
}

/* ─────────────────────────────────────────────── */
/* Dismiss store                                   */
/* ─────────────────────────────────────────────── */

const DISMISS_KEY = "verdant:m:dismissed_nudges";
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface DismissMap {
  [insightId: string]: number; // dismissedAt as epoch ms
}

function loadDismissed(): DismissMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(scopedKey(DISMISS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveDismissed(d: DismissMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(DISMISS_KEY), JSON.stringify(d));
  } catch {}
}

export function dismissInsight(id: string): void {
  const d = loadDismissed();
  d[id] = Date.now();
  saveDismissed(d);
}

function isDismissed(id: string): boolean {
  const d = loadDismissed();
  const ts = d[id];
  if (typeof ts !== "number") return false;
  const elapsed = Date.now() - ts;
  if (elapsed > DISMISS_TTL_MS) {
    // Expired — clean up so the map doesn't grow forever.
    delete d[id];
    saveDismissed(d);
    return false;
  }
  return true;
}

/* ─────────────────────────────────────────────── */
/* Helpers                                         */
/* ─────────────────────────────────────────────── */

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/* ─────────────────────────────────────────────── */
/* Triggers                                        */
/* ─────────────────────────────────────────────── */

function ruleNegativeCashflow(lines: BudgetLine[]): Insight | null {
  if (typeof window === "undefined") return null;
  const now = new Date();
  if (now.getDate() < 20) return null;

  try {
    const income = Math.round(
      householdNetSalary() + getPassiveIncomeSummary().totalMonthly
    );
    const debt = getDebtSummary(loadDebtData());
    const variableSpent = lines.reduce((s, l) => s + l.actual, 0);
    const net = income - (variableSpent + debt.monthlyTotal);
    if (net >= -500) return null;
    return {
      id: `negative_cashflow:${monthKey()}`,
      kind: "negative_cashflow",
      priority: 1,
      eyebrow: "החודש לא עובד",
      body: `החודש תסיימו במינוס של כ-${formatShekel(
        -net
      )}. אולי יש הוצאות שלא נרשמו, או קטגוריה שכדאי לצמצם.`,
      action: { label: "רישום הוצאה", target: "add_expense" },
    };
  } catch {
    return null;
  }
}

function rulePaceWarning(lines: BudgetLine[]): Insight | null {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const totalDays = daysInMonth(now);
  const monthFrac = dayOfMonth / totalDays;
  if (monthFrac < 0.2) return null; // first few days are too noisy

  let worst: { line: BudgetLine; ratio: number } | null = null;
  for (const l of lines) {
    if (l.budget <= 0 || l.actual <= 0) continue;
    const spendFrac = l.actual / l.budget;
    const ratio = spendFrac / monthFrac;
    if (ratio < 1.4) continue;
    if (l.status === "over") continue; // covered by other rules
    if (!worst || ratio > worst.ratio) {
      worst = { line: l, ratio };
    }
  }
  if (!worst) return null;

  const projectedOver = Math.round(
    Math.max(0, worst.line.actual / monthFrac - worst.line.budget)
  );
  const spentPct = Math.round((worst.line.actual / worst.line.budget) * 100);
  return {
    id: `pace_warning:${worst.line.key}:${monthKey()}`,
    kind: "pace_warning",
    priority: 2,
    eyebrow: "קצב מהיר מדי",
    body: `${worst.line.label}: ניצלת ${spentPct}% מהתקציב אחרי ${dayOfMonth} ימים בלבד. בקצב הזה תחרגו בכ-${formatShekel(projectedOver)}.`,
    action: {
      label: "בדוק את הקטגוריה",
      target: "category",
      payload: worst.line.key,
    },
  };
}

function ruleGoalTargetMiss(buckets: Bucket[]): Insight | null {
  const now = Date.now();
  const FOUR_MONTHS_MS = 4 * 30 * 24 * 60 * 60 * 1000;

  for (const b of buckets) {
    if (b.archived || b.targetAmount <= 0) continue;
    if (!b.targetDate) continue;
    const target = new Date(b.targetDate).getTime();
    if (!Number.isFinite(target)) continue;
    const msToTarget = target - now;
    if (msToTarget <= 0 || msToTarget > FOUR_MONTHS_MS) continue;

    const progress = b.currentAmount / b.targetAmount;
    if (progress >= 0.75) continue;

    const monthsRemaining = Math.max(1, Math.round(msToTarget / (30 * 86_400_000)));
    const monthlyContribution = b.monthlyContribution || 0;
    const projectedAdd = monthlyContribution * monthsRemaining;
    const projectedFinal = b.currentAmount + projectedAdd;
    if (projectedFinal >= b.targetAmount) continue;

    const shortfall = Math.round(b.targetAmount - projectedFinal);
    const projectedPct = Math.round((projectedFinal / b.targetAmount) * 100);
    return {
      id: `goal_target_miss:${b.id}:${monthKey()}`,
      kind: "goal_target_miss",
      priority: 3,
      eyebrow: "יעד בסיכון",
      body: `${b.name}: לפי הקצב הנוכחי תגיעו ל-${projectedPct}% מהיעד. חסרים כ-${formatShekel(shortfall)}.`,
      action: { label: "פתח את היעד", target: "goals", payload: b.id },
    };
  }
  return null;
}

function ruleLoanEnding(loans: Loan[]): Insight | null {
  for (const loan of loans) {
    const elapsed = loanElapsedMonths(loan.startDate);
    const remaining = loan.totalPayments - elapsed;
    if (remaining > 3 || remaining <= 0) continue;
    return {
      id: `loan_ending:${loan.id}:${monthKey()}`,
      kind: "loan_ending",
      priority: 4,
      eyebrow: "הזדמנות בקרוב",
      body: `ההלוואה מ-${loan.lender || "המלווה"} מסתיימת בעוד ${remaining} חודשים — ${formatShekel(loan.monthlyPayment)} יתפנו לתזרים. לאן הם הולכים?`,
      action: { label: "פתח יעד חדש", target: "goals" },
    };
  }
  return null;
}

function ruleGoalBehind(buckets: Bucket[]): Insight | null {
  const now = new Date();
  if (now.getDate() < 15) return null;
  const month = monthKey();

  for (const b of buckets) {
    if (b.archived || b.priority !== "high") continue;
    if (b.monthlyContribution <= 0) continue;
    const checkedIn = (b.contributionHistory || []).some((c) => c.month === month);
    if (checkedIn) continue;
    return {
      id: `goal_behind:${b.id}:${month}`,
      kind: "goal_behind",
      priority: 5,
      eyebrow: "הפקדה חסרה",
      body: `עוד לא הפקדתם ל-${b.name} החודש (₪0 מתוך ${formatShekel(b.monthlyContribution)} שתכננתם).`,
      action: {
        label: "אישור הפקדה",
        target: "goal_check_in",
        payload: b.id,
      },
    };
  }
  return null;
}

function ruleSurplusOverflow(lines: BudgetLine[]): Insight | null {
  const surplus = lines.find((l) => l.remaining >= 500 && l.status !== "over");
  const overflow = lines.find(
    (l) => l.status === "over" && l.actual - l.budget >= 300
  );
  if (!surplus || !overflow || surplus.key === overflow.key) return null;
  const overshoot = Math.round(overflow.actual - overflow.budget);
  return {
    id: `surplus_overflow:${surplus.key}->${overflow.key}:${monthKey()}`,
    kind: "surplus_overflow",
    priority: 6,
    eyebrow: "שווה לאזן",
    body: `יש לך ${formatShekel(surplus.remaining)} עודף ב-${surplus.label} וחריגה של ${formatShekel(overshoot)} ב-${overflow.label}. שווה להעביר?`,
    action: {
      label: "ערוך את התקציב",
      target: "edit_category",
      payload: overflow.key,
    },
  };
}

function ruleStaleSnapshot(history: NetWorthSnapshot[]): Insight | null {
  if (history.length < 3) return null;
  const last = history[history.length - 1];
  const lastDate = new Date(last.date);
  if (Number.isNaN(lastDate.getTime())) return null;
  const days = Math.floor((Date.now() - lastDate.getTime()) / 86_400_000);
  if (days < 45) return null;
  return {
    id: `stale_snapshot:${last.id}`,
    kind: "stale_snapshot",
    priority: 7,
    eyebrow: "תמונת מצב ישנה",
    body: `לא עדכנת את המאזן מזה ${days} יום. אולי הצמחת בלי לדעת.`,
    action: { label: "צלם תמונה חדשה", target: "balance" },
  };
}

/* ─────────────────────────────────────────────── */
/* Public API                                      */
/* ─────────────────────────────────────────────── */

/** Run every rule, drop dismissed ones, sort by priority, return the
 *  highest-priority insight — or null if everything is fine (silence is
 *  a valid state). */
export function computeTopInsight(): Insight | null {
  if (typeof window === "undefined") return null;

  let lines: BudgetLine[] = [];
  try {
    lines = buildBudgetLines(0);
  } catch {}

  let buckets: Bucket[] = [];
  try {
    buckets = loadBuckets();
  } catch {}

  let loans: Loan[] = [];
  try {
    loans = loadDebtData().loans.filter(isLoanActive);
  } catch {}

  let history: NetWorthSnapshot[] = [];
  try {
    history = loadHistory();
  } catch {}

  const candidates: (Insight | null)[] = [
    ruleNegativeCashflow(lines),
    rulePaceWarning(lines),
    ruleGoalTargetMiss(buckets),
    ruleLoanEnding(loans),
    ruleGoalBehind(buckets),
    ruleSurplusOverflow(lines),
    ruleStaleSnapshot(history),
  ];

  const live = candidates.filter((x): x is Insight => x !== null && !isDismissed(x.id));
  if (live.length === 0) return null;
  live.sort((a, b) => a.priority - b.priority);
  return live[0];
}

function formatShekel(n: number): string {
  const rounded = Math.round(Math.abs(n));
  return `₪${rounded.toLocaleString("he-IL")}`;
}
