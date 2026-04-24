/**
 * Impact Engine — ties every shekel of overage to a concrete life goal.
 *
 * Philosophy: Numbers are abstract. Goals are real.
 * When a category runs over budget, we don't say "you spent 450₪ too much on leisure" —
 * we say "this reduces your down-payment for the apartment by 450₪".
 *
 * The engine assumes overage comes directly out of the highest-priority
 * goal's monthly contribution (the nearest, most urgent dream).
 */

export interface ImpactGoal {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  targetDate: string;
  monthlyContrib: number;
  priority: "high" | "medium" | "low";
}

export interface ImpactResult {
  /** The goal whose progress is being eaten by the overage */
  goal: ImpactGoal | null;
  /** Overage amount in ₪ (always positive) */
  overage: number;
  /** Delay in days this overage adds to the goal's timeline */
  delayDays: number;
  /** Human-readable sentence for UI */
  message: string;
  /** Severity for color-coding */
  severity: "info" | "warning" | "danger";
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Pick the goal most affected by an overage. We prioritise by:
 * 1. Priority (high → low)
 * 2. Nearest target date (soonest first)
 */
export function pickImpactGoal(goals: ImpactGoal[]): ImpactGoal | null {
  if (!goals.length) return null;
  const active = goals.filter(g => g.monthlyContrib > 0);
  const pool = active.length > 0 ? active : goals;
  return [...pool].sort((a, b) => {
    const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
  })[0];
}

/**
 * Compute the impact of an overage on the top-priority goal.
 * @param overage amount in ₪ (positive number)
 * @param categoryLabel e.g. "פנאי", "מזון"
 * @param goals user goals list (from vision page)
 */
export function computeImpact(
  overage: number,
  categoryLabel: string,
  goals: ImpactGoal[]
): ImpactResult {
  const abs = Math.abs(Math.round(overage));
  const goal = pickImpactGoal(goals);

  if (!goal || abs <= 0) {
    return {
      goal: null,
      overage: abs,
      delayDays: 0,
      severity: "info",
      message: "",
    };
  }

  // How many days does this overage delay the goal?
  const dailyContrib = goal.monthlyContrib / 30;
  const delayDays = dailyContrib > 0 ? Math.round(abs / dailyContrib) : 0;

  const severity: ImpactResult["severity"] =
    abs >= 1000 ? "danger" : abs >= 300 ? "warning" : "info";

  const message =
    `החריגה ב״${categoryLabel}״ מקטינה את החיסכון ל״${goal.name}״ ב-${abs.toLocaleString("he-IL")} ₪` +
    (delayDays > 0 ? ` · דחייה של ${delayDays} ימים` : "");

  return { goal, overage: abs, delayDays, severity, message };
}

/**
 * Read goals from localStorage (same key as vision page).
 * Returns empty array if not available (SSR-safe).
 */
import { scopedKey } from "./client-scope";

export function loadImpactGoals(): ImpactGoal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey("verdant:vision_goals"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((g: any) => ({
      id: g.id,
      name: g.name,
      icon: g.icon || "flag",
      targetAmount: g.targetAmount || 0,
      targetDate: g.targetDate || "",
      monthlyContrib: g.monthlyContrib || 0,
      priority: g.priority || "medium",
    }));
  } catch {
    return [];
  }
}

/**
 * Map from parser category key → Hebrew budget label.
 * Overage is detected per category against a soft baseline.
 */
export const CATEGORY_LABELS_HE: Record<string, string> = {
  food: "מזון וצריכה",
  housing: "דיור ומגורים",
  transport: "תחבורה ורכב",
  utilities: "חשבונות שוטפים",
  health: "בריאות",
  education: "חינוך וילדים",
  insurance: "ביטוח",
  leisure: "פנאי ובידור",
  shopping: "קניות",
  dining_out: "אוכל בחוץ ובילויים",
  subscriptions: "מנויים",
  home_maintenance: "תחזוקת בית",
  misc: "שונות",
  other: "אחר",
};
