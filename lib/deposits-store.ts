/**
 * ═══════════════════════════════════════════════════════════
 *  Monthly Deposits — SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════
 *
 * The client records every monthly contribution here:
 *   • pension / hishtalmut / gemel funds
 *   • securities (investment portfolio)
 *   • bank savings (emergency fund, goals)
 *
 * Writing a deposit fires cross-store events so that:
 *   • pension balance increases by the deposit amount
 *   • dashboard net worth updates
 *   • budget "חסכונות והשקעות" actual grows
 *
 * Storage layout (per client):
 *   verdant:deposits:plans   → DepositPlan[]   (what's supposed to happen monthly)
 *   verdant:deposits:log     → DepositEntry[]  (what actually happened)
 */

import { scopedKey } from "./client-scope";
import { loadPensionFunds, savePensionFunds, type PensionFund } from "./pension-store";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

export type DepositTargetKind =
  | "pension" // bumps a PensionFund balance
  | "hishtalmut" // bumps a PensionFund balance (type=hishtalmut)
  | "gemel" // bumps a PensionFund balance (type=gemel)
  | "securities" // informational — investments page owns the balance
  | "savings"; // informational — bank account / goal

export interface DepositTarget {
  kind: DepositTargetKind;
  /** Reference id to the target entity (pension fund id, account id, goal id, etc.). */
  refId: string;
  /** Display label — stored alongside so we keep history readable even if refId is renamed. */
  label: string;
}

export interface DepositPlan {
  id: string;
  target: DepositTarget;
  /** Expected monthly contribution in ILS. */
  monthlyAmount: number;
  /** When false, the plan is skipped when seeding the current month. */
  active: boolean;
  /** ISO timestamp for auditing. */
  createdAt: string;
  updatedAt: string;
}

export interface DepositEntry {
  id: string;
  /** YYYY-MM */
  month: string;
  target: DepositTarget;
  /** Actual amount deposited. 0 = skipped / missed. */
  amount: number;
  /** Optional user note. */
  note?: string;
  /** When true, the deposit was confirmed — balances have been bumped. */
  confirmed: boolean;
  /** ISO timestamp. */
  createdAt: string;
  updatedAt: string;
  /** The plan this entry was seeded from, if any. */
  planId?: string;
}

/* ─────────────────────────────────────────────────────────────
   Storage keys + events
   ───────────────────────────────────────────────────────────── */

const PLANS_KEY = "verdant:deposits:plans";
const LOG_KEY = "verdant:deposits:log";

export const DEPOSITS_EVENT = "verdant:deposits:updated";

const uid = () => "d" + Math.random().toString(36).slice(2, 10);

function nowIso(): string {
  return new Date().toISOString();
}

export function currentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ─────────────────────────────────────────────────────────────
   Plans CRUD
   ───────────────────────────────────────────────────────────── */

export function loadPlans(): DepositPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(PLANS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DepositPlan[];
  } catch {}
  return [];
}

export function savePlans(plans: DepositPlan[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(PLANS_KEY), JSON.stringify(plans));
    window.dispatchEvent(new Event(DEPOSITS_EVENT));
  } catch {}
}

export function addPlan(input: Omit<DepositPlan, "id" | "createdAt" | "updatedAt">): DepositPlan {
  const plan: DepositPlan = {
    ...input,
    id: uid(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const plans = loadPlans();
  plans.push(plan);
  savePlans(plans);
  return plan;
}

export function updatePlan(id: string, patch: Partial<DepositPlan>): void {
  const plans = loadPlans();
  const idx = plans.findIndex((p) => p.id === id);
  if (idx < 0) return;
  plans[idx] = { ...plans[idx], ...patch, updatedAt: nowIso() };
  savePlans(plans);
}

export function deletePlan(id: string): void {
  savePlans(loadPlans().filter((p) => p.id !== id));
}

/* ─────────────────────────────────────────────────────────────
   Entry log CRUD
   ───────────────────────────────────────────────────────────── */

export function loadEntries(): DepositEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(LOG_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DepositEntry[];
  } catch {}
  return [];
}

export function saveEntries(entries: DepositEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(LOG_KEY), JSON.stringify(entries));
    window.dispatchEvent(new Event(DEPOSITS_EVENT));
  } catch {}
}

/** Entries for a given month (YYYY-MM). */
export function entriesForMonth(month: string): DepositEntry[] {
  return loadEntries().filter((e) => e.month === month);
}

/**
 * Seed the current month with one entry per active plan that isn't
 * already represented in the log. Safe to call repeatedly — idempotent.
 */
/**
 * Sync /goals → /deposits — auto-creates DepositPlans for every bucket with
 * a monthly contribution, so the user sees a unified monthly checklist.
 *
 * Built 2026-04-28 per Nir: "אם יעד אומר ₪300/חודש למטרה X — זה צריך להופיע
 * בהפקדות כצ'קליסט". Idempotent — runs safely on every /deposits mount:
 *
 *  - bucket has monthlyContribution > 0 + no plan yet → create plan
 *  - plan exists but bucket changed amount → update plan
 *  - plan exists but bucket was deleted → deactivate plan (keep history)
 */
export function syncGoalsToDepositPlans(
  buckets: Array<{
    id: string;
    name: string;
    monthlyContribution?: number;
  }>
): { created: number; updated: number; deactivated: number } {
  if (typeof window === "undefined") return { created: 0, updated: 0, deactivated: 0 };

  const plans = loadPlans();
  const planByRefId = new Map<string, DepositPlan>();
  for (const p of plans) {
    if (p.target.kind === "savings") planByRefId.set(p.target.refId, p);
  }

  let created = 0,
    updated = 0,
    deactivated = 0;
  const liveBucketIds = new Set<string>();

  for (const b of buckets) {
    const monthly = b.monthlyContribution || 0;
    if (monthly <= 0) continue;
    liveBucketIds.add(b.id);

    const existing = planByRefId.get(b.id);
    if (!existing) {
      plans.push({
        id: uid(),
        target: { kind: "savings", refId: b.id, label: b.name },
        monthlyAmount: monthly,
        active: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      created++;
    } else if (
      existing.monthlyAmount !== monthly ||
      existing.target.label !== b.name ||
      !existing.active
    ) {
      existing.monthlyAmount = monthly;
      existing.target.label = b.name;
      existing.active = true;
      existing.updatedAt = nowIso();
      updated++;
    }
  }

  // Deactivate plans whose bucket no longer exists (or no longer has monthly).
  for (const p of plans) {
    if (p.target.kind !== "savings") continue;
    if (!liveBucketIds.has(p.target.refId) && p.active) {
      p.active = false;
      p.updatedAt = nowIso();
      deactivated++;
    }
  }

  if (created || updated || deactivated) savePlans(plans);
  return { created, updated, deactivated };
}

export function seedMonth(month: string = currentMonthKey()): DepositEntry[] {
  const plans = loadPlans().filter((p) => p.active);
  const entries = loadEntries();
  const existingByPlan = new Set(
    entries.filter((e) => e.month === month && e.planId).map((e) => e.planId!)
  );

  let changed = false;
  for (const plan of plans) {
    if (existingByPlan.has(plan.id)) continue;
    entries.push({
      id: uid(),
      month,
      target: { ...plan.target },
      amount: plan.monthlyAmount,
      confirmed: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      planId: plan.id,
    });
    changed = true;
  }
  if (changed) saveEntries(entries);
  return entries.filter((e) => e.month === month);
}

/**
 * Confirm a deposit entry. If it targets a pension fund, the fund's
 * balance is bumped by the amount. Returns the updated entry.
 */
export function confirmEntry(entryId: string, amount?: number): DepositEntry | null {
  const entries = loadEntries();
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return null;

  const prev = entries[idx];
  const finalAmount = amount ?? prev.amount;

  // If already confirmed and the amount hasn't changed, no-op.
  if (prev.confirmed && prev.amount === finalAmount) return prev;

  // Compute the delta we need to apply to the target:
  //   new_confirmed_amount − previously_applied_confirmed_amount
  const alreadyApplied = prev.confirmed ? prev.amount : 0;
  const delta = finalAmount - alreadyApplied;

  if (delta !== 0) {
    applyToTarget(prev.target, delta);
  }

  const updated: DepositEntry = {
    ...prev,
    amount: finalAmount,
    confirmed: true,
    updatedAt: nowIso(),
  };
  entries[idx] = updated;
  saveEntries(entries);
  return updated;
}

/** Mark an entry as unconfirmed (skipped). Reverses balance bumps if previously confirmed. */
export function unconfirmEntry(entryId: string): DepositEntry | null {
  const entries = loadEntries();
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return null;

  const prev = entries[idx];
  if (!prev.confirmed) return prev;

  // Reverse the previously-applied amount.
  applyToTarget(prev.target, -prev.amount);

  const updated: DepositEntry = {
    ...prev,
    confirmed: false,
    updatedAt: nowIso(),
  };
  entries[idx] = updated;
  saveEntries(entries);
  return updated;
}

/**
 * Delete an entry. If it was confirmed, reverses the balance bump first
 * so we never leak balance on deletion.
 */
export function deleteEntry(entryId: string): void {
  const entries = loadEntries();
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  const prev = entries[idx];
  if (prev.confirmed) applyToTarget(prev.target, -prev.amount);
  entries.splice(idx, 1);
  saveEntries(entries);
}

/** Upsert a one-off entry (e.g. a deposit not tied to a plan). */
export function upsertEntry(
  input: Omit<DepositEntry, "id" | "createdAt" | "updatedAt"> & { id?: string }
): DepositEntry {
  const entries = loadEntries();
  const now = nowIso();
  if (input.id) {
    const idx = entries.findIndex((e) => e.id === input.id);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], ...input, updatedAt: now } as DepositEntry;
      saveEntries(entries);
      return entries[idx];
    }
  }
  const entry: DepositEntry = {
    id: input.id ?? uid(),
    month: input.month,
    target: input.target,
    amount: input.amount,
    confirmed: input.confirmed,
    note: input.note,
    createdAt: now,
    updatedAt: now,
    planId: input.planId,
  };
  entries.push(entry);
  saveEntries(entries);
  return entry;
}

/* ─────────────────────────────────────────────────────────────
   Cross-store sync
   ───────────────────────────────────────────────────────────── */

/**
 * Apply a delta to the target's balance (if the target type supports it).
 * Pension-family targets (pension / hishtalmut / gemel) bump the matching
 * PensionFund balance. securities / savings are informational only —
 * those stores own their balance via their own UI.
 *
 * Every balance change also flows into the budget's "חסכונות והשקעות" row,
 * so month totals stay in sync with actual deposits.
 */
function applyToTarget(target: DepositTarget, delta: number): void {
  if (delta === 0) return;

  if (target.kind === "pension" || target.kind === "hishtalmut" || target.kind === "gemel") {
    const funds = loadPensionFunds();
    const idx = funds.findIndex((f) => f.id === target.refId);
    if (idx >= 0) {
      const fund: PensionFund = funds[idx];
      funds[idx] = { ...fund, balance: Math.max(0, (fund.balance || 0) + delta) };
      savePensionFunds(funds);
    }
  }
  // securities / savings have no automatic balance bump — those stores
  // own their own balance. But the budget row still needs to reflect the
  // confirmed deposit.

  syncConfirmedTotalToBudget(currentMonthKey());
}

/** Budget row name that receives the confirmed deposits total. */
const BUDGET_ROW_NAME = "חסכונות והשקעות";

function budgetKey(month: string): string {
  // month = "2026-04" → "verdant:budget_2026_04"
  return `verdant:budget_${month.replace("-", "_")}`;
}

/**
 * Write the month's confirmed-deposits total to the "חסכונות והשקעות"
 * row's `actual` field in the budget JSON. No-ops if the budget blob
 * or the row doesn't exist yet.
 */
function syncConfirmedTotalToBudget(month: string): void {
  if (typeof window === "undefined") return;
  try {
    const total = confirmedSavingsActualForMonth(month);
    const key = scopedKey(budgetKey(month));
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data?.sections?.fixed || !Array.isArray(data.sections.fixed)) return;

    const rows: Array<{ name: string; actual?: number }> = data.sections.fixed;
    const idx = rows.findIndex((r) => r.name === BUDGET_ROW_NAME);
    if (idx < 0) return;

    rows[idx] = { ...rows[idx], actual: total };
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

/* ─────────────────────────────────────────────────────────────
   Summary helpers (for dashboard widget, /deposits page, etc.)
   ───────────────────────────────────────────────────────────── */

export interface MonthSummary {
  month: string;
  total: number;
  confirmedTotal: number;
  confirmedCount: number;
  plannedCount: number;
  entries: DepositEntry[];
}

export function summaryForMonth(month: string = currentMonthKey()): MonthSummary {
  // Seeding is safe & idempotent — ensures UI always shows the plans for the active month.
  const entries = seedMonth(month);
  const confirmedTotal = entries
    .filter((e) => e.confirmed)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);
  return {
    month,
    total,
    confirmedTotal,
    confirmedCount: entries.filter((e) => e.confirmed).length,
    plannedCount: entries.length,
    entries,
  };
}

/** Sum of confirmed savings-type deposits for a month (for budget actual). */
export function confirmedSavingsActualForMonth(month: string = currentMonthKey()): number {
  return loadEntries()
    .filter((e) => e.month === month && e.confirmed)
    .reduce((s, e) => s + (e.amount || 0), 0);
}
