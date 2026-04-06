/**
 * Verdant Ledger · Tasks Engine
 *
 * Detects gaps across the household's data and emits recommendations.
 * Each rule is idempotent via `rule_id` (upsert key).
 * Severity drives UI colour + health score:
 *   high → 20pts, medium → 8pts, low → 3pts (deducted from 100).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CashflowSummary, NetWorth, Goal, Liability, Asset, Task, TaskSeverity,
} from "@/types/db";
import { SAFETY_THRESHOLD_ILS } from "./safety-margin";

interface Snapshot {
  householdId: string;
  cashflow: CashflowSummary[];
  netWorth: NetWorth | null;
  goals: Goal[];
  liabilities: Liability[];
  assets: Asset[];
}

interface TaskDraft {
  rule_id: string;
  title: string;
  detail: string;
  severity: TaskSeverity;
  cta_href: string;
}

type RuleFn = (s: Snapshot) => TaskDraft | null;

// =============================================================================
// Rules — each returns a task if the gap exists, else null
// =============================================================================

const ruleNoCashflow: RuleFn = (s) =>
  s.cashflow.length === 0
    ? {
        rule_id: "no_cashflow_data",
        title: "חסרים נתוני מאזן ותזרים",
        detail: "לא נמצאו חודשים פתוחים. פתח חודש ב'מאזן ותזרים' כדי להתחיל לאסוף Actuals.",
        severity: "high",
        cta_href: "/cashflow-map",
      }
    : null;

const ruleNegativeCashflow: RuleFn = (s) => {
  const avgGap = s.cashflow.length
    ? s.cashflow.reduce((acc, m) => acc + m.cashflow_gap, 0) / s.cashflow.length
    : 0;
  return avgGap < 0
    ? {
        rule_id: "negative_cashflow",
        title: "תזרים חודשי ממוצע שלילי",
        detail: `ממוצע של ${Math.round(avgGap).toLocaleString("he-IL")} ₪ לחודש. יש לבחון קיצוץ הוצאות או הגדלת הכנסה.`,
        severity: "high",
        cta_href: "/budget",
      }
    : null;
};

const ruleLowSafety: RuleFn = (s) => {
  const lastGap = s.cashflow[0]?.cashflow_gap ?? null;
  return lastGap != null && lastGap >= 1 && lastGap <= SAFETY_THRESHOLD_ILS
    ? {
        rule_id: "low_safety_margin",
        title: "מרווח ביטחון נמוך",
        detail: `התזרים הפנוי החודש (${lastGap.toLocaleString("he-IL")} ₪) מתחת לסף הבטיחות של ₪${SAFETY_THRESHOLD_ILS}.`,
        severity: "medium",
        cta_href: "/cashflow-map",
      }
    : null;
};

const ruleNoWealth: RuleFn = (s) =>
  s.assets.length === 0
    ? {
        rule_id: "no_assets",
        title: "לא הוזנו נכסים במפת העושר",
        detail: "אין נכסים רשומים. הוסף חשבונות/השקעות/פנסיות כדי לחשב הון עצמי.",
        severity: "medium",
        cta_href: "/wealth",
      }
    : null;

const ruleNoPension: RuleFn = (s) =>
  !s.assets.some((a) => a.asset_group === "pension")
    ? {
        rule_id: "no_pension_coverage",
        title: "אין כיסוי פנסיוני רשום",
        detail: "לא נמצאו נכסים בקבוצה 'פנסיוני ארוך טווח'. חסר ביטחון כלכלי לפרישה.",
        severity: "high",
        cta_href: "/retirement",
      }
    : null;

const ruleLowEmergencyFund: RuleFn = (s) => {
  const liquid = s.assets
    .filter((a) => a.asset_group === "liquid")
    .reduce((acc, a) => acc + a.balance, 0);
  const avgExpense = s.cashflow.length
    ? s.cashflow.reduce((acc, m) => acc + m.expense_total, 0) / s.cashflow.length
    : 0;
  const monthsCovered = avgExpense > 0 ? liquid / avgExpense : Infinity;
  return monthsCovered < 3
    ? {
        rule_id: "low_emergency_fund",
        title: "קרן חירום מתחת ל-3 חודשים",
        detail: `יש לך נזילות של ${Math.round(monthsCovered * 10) / 10} חודשי הוצאה. מומלץ להגיע ל-3-6.`,
        severity: "medium",
        cta_href: "/wealth",
      }
    : null;
};

const ruleDebtHeavy: RuleFn = (s) => {
  if (!s.netWorth) return null;
  const ratio =
    s.netWorth.total_assets > 0
      ? (s.netWorth.total_liabilities / s.netWorth.total_assets) * 100
      : 100;
  return ratio > 60
    ? {
        rule_id: "high_debt_ratio",
        title: "יחס חוב/נכס גבוה",
        detail: `יחס ${ratio.toFixed(0)}% — מעל הסף הבריא של 40-60%. שקול מיחזור/איחוד הלוואות.`,
        severity: "high",
        cta_href: "/toolbox",
      }
    : null;
};

const ruleExpensiveLoan: RuleFn = (s) => {
  const expensive = s.liabilities.filter((l) => l.rate_pct > 8);
  return expensive.length > 0
    ? {
        rule_id: "expensive_loan",
        title: `הלוואה יקרה (${expensive.length})`,
        detail: `זוהו ${expensive.length} הלוואות בריבית > 8%. כדאי לבדוק איחוד או מיחזור ב'ארגז כלים'.`,
        severity: "medium",
        cta_href: "/toolbox",
      }
    : null;
};

const ruleGoalAtRisk: RuleFn = (s) => {
  const atRisk = s.goals.filter((g) => g.track === "at_risk");
  return atRisk.length > 0
    ? {
        rule_id: "goal_at_risk",
        title: `מטרה בסיכון (${atRisk.length})`,
        detail: `${atRisk.map((g) => g.name).join(", ")} — פער בין FV צפוי ליעד.`,
        severity: "medium",
        cta_href: "/vision",
      }
    : null;
};

const RULES: readonly RuleFn[] = [
  ruleNoCashflow,
  ruleNegativeCashflow,
  ruleLowSafety,
  ruleNoWealth,
  ruleNoPension,
  ruleLowEmergencyFund,
  ruleDebtHeavy,
  ruleExpensiveLoan,
  ruleGoalAtRisk,
];

/**
 * Run all rules against the snapshot → returns drafts to upsert.
 */
export function runRules(snapshot: Snapshot): TaskDraft[] {
  return RULES.map((r) => r(snapshot)).filter((t): t is TaskDraft => t !== null);
}

/**
 * Computes health score from open tasks.
 *   high=-20, medium=-8, low=-3, clamped to [0,100].
 */
export function healthScore(tasks: Pick<Task, "severity" | "status">[]): number {
  const open = tasks.filter((t) => t.status === "open");
  const high = open.filter((t) => t.severity === "high").length;
  const med  = open.filter((t) => t.severity === "medium").length;
  const low  = open.filter((t) => t.severity === "low").length;
  return Math.max(0, Math.min(100, 100 - high * 20 - med * 8 - low * 3));
}

/**
 * Persist drafts — also closes tasks that were remediated
 * (any rule currently absent that had a matching open task before).
 */
export async function persistTasks(
  sb: SupabaseClient,
  householdId: string,
  drafts: TaskDraft[],
): Promise<void> {
  const rows = drafts.map((d) => ({
    household_id: householdId,
    rule_id: d.rule_id,
    title: d.title,
    detail: d.detail,
    severity: d.severity,
    cta_href: d.cta_href,
    status: "open" as const,
  }));
  if (rows.length > 0) {
    const { error } = await sb
      .from("tasks")
      .upsert(rows, { onConflict: "household_id,rule_id" });
    if (error) throw error;
  }
  // Auto-close rules no longer triggered
  const activeIds = drafts.map((d) => d.rule_id);
  const { data: open } = await sb
    .from("tasks")
    .select("id,rule_id")
    .eq("household_id", householdId)
    .eq("status", "open");
  const toClose = (open ?? []).filter((t) => !activeIds.includes(t.rule_id));
  if (toClose.length) {
    await sb
      .from("tasks")
      .update({ status: "done", done_at: new Date().toISOString() })
      .in("id", toClose.map((t) => t.id));
  }
}
