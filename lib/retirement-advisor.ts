/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Retirement Advisor — Heuristic Engine
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Produces structured insights about a retirement plan: gaps, opportunities,
 * risks, each with concrete impact estimates and (where relevant) actionable
 * levers the UI can wire to sliders.
 *
 * Designed to be swapped with a real Claude API call later — this is the
 * schema the future Server Action will return. For now we generate insights
 * locally so the demo works without API credentials.
 */

import type { IncomeStreamResult } from "./retirement-income";
import type { Assumptions } from "./assumptions";

export interface AdvisorInsight {
  kind: "gap" | "opportunity" | "risk" | "good";
  severity: "critical" | "warning" | "info" | "positive";
  icon: string; // material-symbols name
  title: string;
  detail: string;
  /** Estimated monthly impact in ₪ (positive = adds income, negative = removes). */
  impactMonthly?: number;
  /** Concrete action the UI can wire to a slider / button. */
  action?: {
    label: string;
    kind: "retirement_age" | "monthly_invest" | "swr" | "add_property" | "rollover_hishtalmut";
    delta?: number; // interpretation depends on kind
    targetValue?: number;
  };
}

export interface AdvisorReport {
  summary: string;
  overallSeverity: "good" | "concern" | "critical";
  insights: AdvisorInsight[];
}

export function runAdvisor(
  income: IncomeStreamResult,
  assumptions: Assumptions,
  context: {
    propertyCount: number;
    pensionFundCount: number;
    hasHishtalmut: boolean;
  },
): AdvisorReport {
  const insights: AdvisorInsight[] = [];
  const target = income.targetMonthly;
  const gap = income.gapAtRetirement;
  const retAge = assumptions.retirementAge;
  const retPoint = income.points.find(p => p.age === retAge);
  const projected = retPoint?.total ?? 0;

  /* ── 1. Gap analysis (the headline) ── */
  if (target > 0) {
    const gapPct = gap / target;
    if (gap > 0 && gapPct > 0.3) {
      insights.push({
        kind: "gap", severity: "critical", icon: "warning",
        title: `פער של ${Math.round(gapPct * 100)}% מהיעד`,
        detail: `בגיל ${retAge} צפויה הכנסה של ${fmt(projected)} מול יעד של ${fmt(target)}. זה פער משמעותי שדורש פעולה מיידית — דחיית פרישה, העלאת הפקדה, או הוספת נכס מניב.`,
        impactMonthly: -gap,
      });
    } else if (gap > 0 && gapPct > 0.1) {
      insights.push({
        kind: "gap", severity: "warning", icon: "trending_down",
        title: `פער בינוני מהיעד`,
        detail: `צפוי להחסיר ${fmt(gap)} בחודש. ניתן לסגור את הפער בעזרת שילוב של דחיית פרישה ב-2-3 שנים ו/או העלאת הפקדה ב-10-15%.`,
        impactMonthly: -gap,
      });
    } else if (gap < 0) {
      insights.push({
        kind: "good", severity: "positive", icon: "check_circle",
        title: "היעד החודשי מכוסה",
        detail: `בגיל ${retAge} צפויה הכנסה של ${fmt(projected)} — מעבר ליעד של ${fmt(target)} (עודף ${fmt(-gap)}).`,
        impactMonthly: -gap,
      });
    }
  }

  /* ── 2. Retirement age leverage ── */
  if (gap > 1000 && retAge < 70) {
    // Each extra year of work: more pension corpus + one less year of drawdown.
    // Rough heuristic: ~2-3% of gap per extra year in ages 62-67, ~5% for 67-70.
    const yearsToAdd = Math.min(3, 70 - retAge);
    insights.push({
      kind: "opportunity", severity: "info", icon: "schedule",
      title: `דחיית פרישה ב-${yearsToAdd} שנים`,
      detail: `דחייה ל-${retAge + yearsToAdd} מגדילה את קרן הפנסיה (יותר הפקדות + פחות שנות משיכה), מעלה את ביטוח הלאומי, ודוחה את התחלת השחיקה של הנזיל. תן לסליידר ניסיון.`,
      action: { label: `נסה גיל ${retAge + yearsToAdd}`, kind: "retirement_age", targetValue: retAge + yearsToAdd },
    });
  }

  /* ── 3. Monthly investment leverage ── */
  if (gap > 500 && (assumptions.monthlyInvestment ?? 0) < 8000) {
    const currentInv = assumptions.monthlyInvestment ?? 0;
    const suggested = Math.round((currentInv + 1500) / 500) * 500;
    insights.push({
      kind: "opportunity", severity: "info", icon: "savings",
      title: "העלאת הפקדה חודשית",
      detail: `ההפקדה הנוכחית (${fmt(currentInv)}) נמוכה יחסית. הגדלה ל-${fmt(suggested)} בחודש לאורך השנים עד הפרישה משנה את קרן ההון בצורה מאסיבית (ריבית דריבית).`,
      action: { label: `נסה ${fmt(suggested)}`, kind: "monthly_invest", targetValue: suggested },
    });
  }

  /* ── 4. No real estate rental income ── */
  if (context.propertyCount === 0 && gap > 2000) {
    insights.push({
      kind: "opportunity", severity: "info", icon: "home_work",
      title: "אין נכס מניב בתמונה",
      detail: "נכס להשקעה הוא שכבה שלישית של הכנסה — יציב, צמוד למדד, לא תלוי בשוק ההון. שווה בדיקה: גם השקעה קטנה של 500K הון עצמי יכולה לייצר 1,500-2,500₪/חודש נטו.",
      action: { label: "לעמוד נדל״ן", kind: "add_property" },
    });
  }

  /* ── 5. Hishtalmut not utilized ── */
  if (!context.hasHishtalmut && gap > 0) {
    insights.push({
      kind: "opportunity", severity: "info", icon: "school",
      title: "אין קרן השתלמות פעילה",
      detail: "קרן השתלמות היא הכלי הכי יעיל מבחינת מס בישראל: פטורה לחלוטין אחרי 6 שנים. אם השכיר לא מפריש — זו הזדמנות שכדאי לדרוש מהמעסיק.",
    });
  }

  /* ── 6. SWR risk flag ── */
  const swr = assumptions.safeWithdrawalRate ?? 0.04;
  if (swr >= 0.05) {
    insights.push({
      kind: "risk", severity: "warning", icon: "error",
      title: `SWR ${(swr * 100).toFixed(1)}% — אגרסיבי`,
      detail: `שיעור משיכה של 5%+ מגדיל את הסיכון לאוזל ההון בפרישה ארוכה (מעל 25 שנה). הסטנדרט המקובל (Trinity Study) הוא 4%. שקול להוריד בהדרגה.`,
      action: { label: "הורד ל-4%", kind: "swr", targetValue: 4 },
    });
  }

  /* ── 7. Coverage via layer analysis ── */
  if (retPoint && target > 0) {
    const layers = [
      { name: "פנסיה", val: retPoint.pension },
      { name: "שכ״ד נטו", val: retPoint.realestateNet },
      { name: "נזיל (SWR)", val: retPoint.liquidSWR },
      { name: "ביטוח לאומי", val: retPoint.btl },
      { name: "השתלמות", val: retPoint.hishtalmut },
    ].filter(l => l.val > 0).sort((a, b) => b.val - a.val);

    if (layers.length > 0) {
      const biggest = layers[0];
      const biggestPct = Math.round((biggest.val / (retPoint.total || 1)) * 100);
      if (biggestPct > 65) {
        insights.push({
          kind: "risk", severity: "warning", icon: "pie_chart",
          title: `תלות של ${biggestPct}% ב-${biggest.name}`,
          detail: `שכבת ${biggest.name} מספקת יותר משני-שליש מההכנסה הצפויה. גיוון בין מקורות (נדל״ן, נזיל, פנסיה) מקטין סיכון שינויי רגולציה/שוק.`,
        });
      }
    }
  }

  /* ── Summary ── */
  const critical = insights.filter(i => i.severity === "critical").length;
  const warnings = insights.filter(i => i.severity === "warning").length;
  let overallSeverity: AdvisorReport["overallSeverity"] =
    critical > 0 ? "critical" : warnings > 0 ? "concern" : "good";

  const coverage = target > 0 ? Math.round((projected / target) * 100) : 100;
  const summary =
    overallSeverity === "good"
      ? `התוכנית במצב טוב: כיסוי ${coverage}% מהיעד בגיל ${retAge}.`
      : overallSeverity === "concern"
        ? `התוכנית ניתנת לשיפור — כיסוי ${coverage}% מהיעד. זוהו ${warnings} הזדמנויות.`
        : `דרושה פעולה: כיסוי של ${coverage}% בלבד מהיעד. ${critical} נקודות קריטיות זוהו.`;

  return { summary, overallSeverity, insights };
}

function fmt(v: number) {
  return `₪${Math.round(v).toLocaleString("he-IL")}`;
}
