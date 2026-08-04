"use client";

import { scopedKey } from "./client-scope";
import { pushBlob } from "./sync/blob-sync";
import { getHouseholdId } from "./sync/remote-sync";
import { loadAssumptions, saveAssumptions } from "./assumptions";
import { loadBudgets, saveBudgets } from "./budget-store";
import { loadDebtData, saveDebtData } from "./debt-store";
import { pushOnboardingSnapshot } from "./onboarding-remote";

export type WorkbookRow = { id: string; label: string; value: string; cells?: string[]; note?: string; calculated?: boolean };
export type WorkbookData = Record<string, WorkbookRow[]>;
const KEY = "verdant:family_workbook";

export const WORKBOOK_TABS = [
  { id: "home", label: "בית" }, { id: "questionnaire", label: "שאלון" }, { id: "mapping", label: "מיפוי" },
  { id: "debts", label: "חובות" }, { id: "balance", label: "מאזן" }, { id: "goals", label: "מטרות ויעדים" },
  { id: "cashflow", label: "תזרים" }, { id: "business", label: "עסק" }, { id: "annual", label: "סיכום שנתי" },
  { id: "insights", label: "תובנות" }, { id: "journal", label: "יומן ליווי" }, { id: "calculators", label: "מחשבונים" },
] as const;

const rows = (labels: string[], prefix: string): WorkbookRow[] => labels.map((label, i) => ({ id: `${prefix}-${i}`, label, value: "" }));
const monthlyRows = (labels: string[], prefix: string): WorkbookRow[] => labels.map((label, i) => ({ id: `${prefix}-${i}`, label, value: "", cells: Array.from({ length: 24 }, () => "") }));
export const starter: WorkbookData = {
  questionnaire: rows(["פרטים אישיים", "שם בן/בת זוג 1", "שם בן/בת זוג 2", "שם מלא", "גיל", "סטטוס משפחתי", "עיסוק", "אופן העסקה (שכיר / עצמאי / בעל שליטה)", "טלפון / מייל", "מספר ילדים", "גילאי הילדים", "יש עסק עצמאי במשפחה?", "פרטים פיננסיים — הערכה גסה", "דירת המגורים בבעלותכם?", "שווי הדירה להערכתכם", "שווי נכסים פנסיוניים (פנסיה, גמל, השתלמות)", "חסכונות והשקעות (שוק ההון, מזומן, פיקדונות)", "יתרת משכנתא", "יתרת הלוואות אחרות", "הכנסה חודשית נטו — משפחתית", "הוצאות חודשיות — להערכתכם", "ידע פיננסי וסיכון", "רמת ידע בשוק ההון (מצוין/טוב/בינוני/אין)", "רמת ידע פיננסי", "עד כמה אוהבים סיכון?", "רמת אהבת סיכון", "איך תרגישו אם ההשקעות יירדו ב-30%?", "ביטוחים ומשפחה", "ביטוח בריאות פרטי?", "סכום ביטוח חיים קיים (₪)", "בעיה בריאותית שכדאי לדעת עליה?", "קיימת צוואה / ייפוי כוח מתמשך?", "הורה תלוי (או עתיד להיות תלוי) כלכלית?", "תכנון וציפיות — השיחה האמיתית", "מה הכי מטריד אתכם בכסף היום?", "מה בראש סדר העדיפויות בזמן הקרוב?", "נושא דחוף שחייבים לטפל בו לפני הכל?", "מה הציפיות שלכם מהתהליך?", "מה הציפיות מהתהליך?", "מה יגרום לכם להרגיש בעוד חצי שנה שההחלטה היתה נכונה?", "המטרות הכלכליות הגדולות שלכם", "קרן חירום", "רכישת דירה / שדרוג דירה", "לימודים לילדים", "חתונה / עזרה לילדים", "החלפת רכב", "טיול משפחתי גדול", "שיפוץ הבית", "חופש כלכלי"], "q"),
  mapping: rows(["הכנסות", "משכורת בן/בת זוג 1", "משכורת בן/בת זוג 2", "קצבאות (ילדים)", "משכורת / משיכה מהעסק", "הכנסה נוספת", "סה״כ הכנסות", "הוצאות קבועות", "משכנתא / שכר דירה", "ארנונה", "חשמל", "מים", "גז", "ועד בית", "תקשורת (סלולר, אינטרנט, טלוויזיה)", "ביטוחים", "מנויים", "חינוך וחוגים", "בריאות (קבוע)", "הפקדה לחיסכון", "החזרי הלוואות", "עסקאות בתשלומים", "הוצאות שנתיות (חלוקה חודשית)", "סה״כ קבועות", "הוצאות משתנות", "מזון לבית (סופר)", "אוכל בחוץ ובילויים", "תחבורה (דלק, חניה, תחב״צ)", "סופר פארם", "בריאות", "ביגוד והנעלה", "מתנות לאירועים ולשמחות", "בייביסיטר או עזרה", "בעלי חיים", "סיגריות", "דמי כיס", "תחביבים", "שונות", "חופשה או טיול (נקודתי)", "סה״כ משתנות", "סה״כ הוצאות", "תזרים נטו — מה נשאר"], "m"),
  goals: rows(["שנת הבסיס", "קרן חירום", "רכישת דירה / שדרוג דירה", "לימודים לילדים", "חתונה / עזרה לילדים", "החלפת רכב", "טיול משפחתי גדול", "שיפוץ הבית", "חופש כלכלי", "שנת יעד", "עלות היום", "עלות עתידית", "תשואה ברוטו", "דמי ניהול", "תשואה נטו", "צריך היום — חד-פעמי", "יש כבר ₪", "חסר", "להפקיד כל חודש", "מקצים בפועל ₪", "פער", "הערות"], "g"),
  cashflow: monthlyRows(["תחילת פעילות — חודש", "שנה", "שנת פעילות", "הכנסות", "משכורת / הכנסה 1", "משכורת / הכנסה 2", "קצבאות (ילדים)", "משכורת / משיכה מהעסק", "הכנסה נוספת", "סה״כ הכנסות", "הוצאות קבועות", "משכנתא / שכר דירה", "ארנונה", "חשמל", "מים", "גז", "ועד בית", "תקשורת (סלולר, אינטרנט, טלוויזיה)", "ביטוחים", "מנויים", "חינוך", "בריאות", "הפקדה לחיסכון", "החזרי הלוואות", "עסקאות בתשלומים", "סה״כ הוצאות קבועות", "הוצאות משתנות", "מזון לבית", "אוכל בחוץ ובילויים", "תחבורה", "סופר פארם", "ביגוד והנעלה", "מתנות", "בייביסיטר", "בעלי חיים", "תחביבים", "שונות", "סה״כ הוצאות משתנות", "סה״כ הוצאות", "תזרים נטו", "מצטבר (ביצוע)", "כרית ביטחון בעו״ש"], "cf"),
  annual: rows(["הכנסה שנתית", "הוצאה שנתית", "תזרים נטו", "שיעור חיסכון", "שיעור חיסכון — סטטוס", "רמזור בריאות תזרימית", "נטל הלוואות מההכנסה", "קבועות מההכנסה", "לאן הולך הכסף — שנתי, תכנון מול ביצוע", "קטגוריה", "תכנון", "ביצוע", "פער", "% מהכנסה", "שנה", "מה קרה השנה?", "חודש", "תכנון חודשי", "ביצוע חודשי"], "an"),
  business: monthlyRows(["הכנסות תפעוליות", "הוצאות קבועות של העסק", "הוצאות משתנות של העסק", "הפרשה למסים ומע״מ", "רווח תפעולי", "משכורת בעלים — משיכה לבית", "נשאר בעסק (אחרי משכורת)", "מצטבר בעסק"], "b"),
  journal: rows(["תאריך תחילת הליווי", "חודש ליווי נוכחי", "פגישה 1", "פגישה 1 — תאריך", "פגישה 1 — נושא", "פגישה 1 — מה סוכם", "פגישה 1 — משימות עד הפגישה הבאה", "פגישה 1 — מה לקחנו מהפגישה", "פגישה 2", "פגישה 2 — תאריך", "פגישה 2 — נושא", "פגישה 2 — מה סוכם", "פגישה 2 — משימות עד הפגישה הבאה", "פגישה 2 — מה לקחנו מהפגישה", "פגישה 3", "פגישה 3 — תאריך", "פגישה 3 — נושא", "פגישה 3 — מה סוכם", "פגישה 3 — משימות עד הפגישה הבאה", "פגישה 3 — מה לקחנו מהפגישה", "פגישה 4", "פגישה 4 — תאריך", "פגישה 4 — נושא", "פגישה 4 — מה סוכם", "פגישה 4 — משימות עד הפגישה הבאה", "פגישה 4 — מה לקחנו מהפגישה", "פגישה 5", "פגישה 5 — תאריך", "פגישה 5 — נושא", "פגישה 5 — מה סוכם", "פגישה 5 — משימות עד הפגישה הבאה", "פגישה 5 — מה לקחנו מהפגישה"], "j"),
  debts: rows(["הלוואות", "שם ההלוואה / הבנק", "יתרת קרן", "ריבית שנתית", "החזר חודשי", "חודשים שנותרו", "מחשבון איחוד הלוואות", "יתרת חוב לאיחוד", "החזר חודשי נוכחי", "ריבית שנתית חדשה", "תקופה חדשה (חודשים)", "החזר חודשי חדש", "שינוי בהחזר (+ = חיסכון)", "סה״כ שישולם", "מזה ריבית", "סה״כ הלוואות", "עסקאות בתשלומים", "שם העסק", "תאריך העסקה", "מס׳ תשלומים", "סכום חודשי", "בוצעו", "נותרו", "סה״כ פעיל בתשלום", "משכנתא", "שווי הנכס", "יתרת המשכנתא", "החזר חודשי משכנתא", "ריבית ממוצעת", "שנים שנותרו", "LTV — אחוז המימון", "ההון שלכם בנכס"], "d"),
  balance: rows(["מה יש לנו — נכסים", "עו״ש ופיקדונות", "קרן כספית / חיסכון נזיל", "קרן השתלמות", "גמל להשקעה", "תיק השקעות", "חיסכון לילדים", "פנסיה — בן/בת זוג 1", "פנסיה — בן/בת זוג 2", "דירה (שווי שוק)", "רכב", "אחר", "סה״כ נכסים", "מה אנחנו חייבים — התחייבויות", "משכנתא", "הלוואות (נמשך מדף חובות)", "מסגרות אשראי מנוצלות", "אחר", "סה״כ התחייבויות", "השווי הנקי של המשפחה", "LTV — משכנתא מול הדירה", "חוב מול הכנסה שנתית", "מינוף — חוב מול נכסים", "חשבונות בנק — הכלים של הזוג", "פנסיוני — מבט קדימה", "היסטוריית מאזן"], "bal"),
  insights: rows(["שווי נקי", "תזרים חודשי נטו (ממוצע)", "% מהמטרות שמומן", "בריאות פיננסית — רמזור", "מינוף — חוב מהנכסים", "נטל החזרים מההכנסה", "עלות דיור מההכנסה", "שיעור חיסכון", "כרית חירום (חודשים)", "מימון המטרות", "מה עושים עכשיו — לפי סדר עדיפות", "פעולה 1", "פעולה 2", "פעולה 3", "פעולה 4", "פעולה 5"], "i"),
  calculators: rows(["שווי הנכס ו-LTV — הגדלת משכנתא", "שווי הנכס היום (מהמאזן)", "יתרת המשכנתא (מהמאזן)", "LTV — אחוז המימון הנוכחי", "תקרת מימון להגדלה", "ניתן להגדיל עוד", "מחשבון מחזור משכנתא", "ריבית שנתית נוכחית", "שנים שנותרו", "ריבית שנתית חדשה", "החזר חודשי נוכחי", "החזר חודשי אחרי מחזור", "חיסכון חודשי", "חיסכון על כל התקופה", "מחשבון יכולת רכישת נכס", "הון עצמי זמין", "אחוז מימון מקסימלי", "ריבית משכנתא שנתית", "תקופה (שנים)", "מחיר נכס מקסימלי", "סכום המשכנתא", "החזר חודשי צפוי", "מחשבון ביטוח חיים — כמה כיסוי באמת צריך", "הכנסה חודשית שנפסקת", "הכנסות שיישארו לשארים", "הפער החודשי", "שנים לכיסוי הפער", "ריבית ריאלית להיוון", "סה״כ חד-פעמי", "נכסים נזילים והשקעות", "ביטוח חיים קיים", "כיסוי נדרש בריסק", "בן משפחה", "ביטוח בריאות", "ביטוחים נוספים", "פרמיה חודשית", "סה״כ פרמיות"], "calc"),
};

export function loadWorkbook(): WorkbookData {
  // No workbook data cache. The authoritative read is remote and async in the
  // page; this synchronous function is only a safe empty-state fallback.
  return starter;
}

/** Pull canonical site fields back into the workbook before rendering. */
export function hydrateWorkbookFromSite(data: WorkbookData): WorkbookData {
  if (typeof window === "undefined") return data;
  const read = <T,>(key: string, fallback: T): T => {
    try { const raw = localStorage.getItem(scopedKey(key)); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
  };
  const fields = read<Record<string, string>>("verdant:onboarding:fields", {});
  const assumptions = loadAssumptions();
  const values: Record<string, string> = {
    "שם בן/בת זוג 1": fields.p1_name || "",
    "שם בן/בת זוג 2": fields.p2_name || "",
    "מספר ילדים": fields.has_children === "1" ? "2" : "0",
    "רמת ידע פיננסי": fields.financial_knowledge || "",
    "רמת ידע בשוק ההון (מצוין/טוב/בינוני/אין)": fields.financial_knowledge || "",
    "רמת אהבת סיכון": fields.risk_tolerance || "",
    "עד כמה אוהבים סיכון?": fields.risk_tolerance || "",
    "מה הכי מטריד אתכם בכסף היום?": fields.money_concern || "",
    "מה הציפיות מהתהליך?": fields.process_expectations || "",
    "הכנסה חודשית נטו — משפחתית": String(assumptions.monthlyIncome || ""),
    "הוצאות חודשיות — להערכתכם": String(assumptions.monthlyExpenses || ""),
  };
  const withValues = (tab: string, byLabel: Record<string, string>) =>
    (data[tab] || []).map((row) => Object.prototype.hasOwnProperty.call(byLabel, row.label)
      ? { ...row, value: byLabel[row.label] }
      : row);
  const budgets = read<Array<{ label?: string; budget?: number }>>("verdant:budgets", []);
  const budgetValues: Record<string, string> = {};
  const budgetAliases: Record<string, string> = {
    "מזון וצריכה": "מזון לבית (סופר)",
    "דיור ומגורים": "משכנתא / שכר דירה",
    "תקשורת": "תקשורת (סלולר, אינטרנט, טלוויזיה)",
    "חינוך": "חינוך וחוגים",
    "בריאות": "בריאות (קבוע)",
    "תחבורה": "תחבורה (דלק, חניה, תחב״צ)",
  };
  for (const budget of budgets) if (budget.label) {
    budgetValues[budget.label] = String(budget.budget ?? "");
    const workbookLabel = budgetAliases[budget.label];
    if (workbookLabel) budgetValues[workbookLabel] = String(budget.budget ?? "");
  }
  const goals = read<Array<{ name?: string; targetAmount?: number; monthlyContribution?: number }>>("verdant:buckets", []);
  const goalValues: Record<string, string> = {};
  for (const goal of goals) if (goal.name) goalValues[goal.name] = String(goal.monthlyContribution ?? goal.targetAmount ?? "");
  const q = (label: string) => Number((data.questionnaire || []).find((row) => row.label === label)?.value || 0) || 0;
  const homeValue = q("שווי הדירה להערכתכם");
  const mortgage = q("יתרת משכנתא");
  const income = assumptions.monthlyIncome || q("הכנסה חודשית נטו — משפחתית");
  const expenses = assumptions.monthlyExpenses || q("הוצאות חודשיות — להערכתכם");
  const calculated = (tab: string, valuesByLabel: Record<string, string>) =>
    (data[tab] || []).map((row) => Object.prototype.hasOwnProperty.call(valuesByLabel, row.label)
      ? { ...row, value: valuesByLabel[row.label], calculated: true }
      : row);
  const cashflowValues = {
    "סה״כ הכנסות": String(income),
    "סה״כ הוצאות": String(expenses),
    "תזרים נטו": String(income - expenses),
  };
  return {
    ...data,
    questionnaire: (data.questionnaire || []).map((row) =>
      Object.prototype.hasOwnProperty.call(values, row.label) && values[row.label] !== ""
        ? { ...row, value: values[row.label] }
        : row
    ),
    mapping: withValues("mapping", budgetValues).map((row) =>
      ["סה״כ הכנסות", "סה״כ קבועות", "סה״כ משתנות", "סה״כ הוצאות", "תזרים נטו — מה נשאר"].includes(row.label)
        ? { ...row, calculated: true }
        : row
    ),
    goals: (data.goals || []).map((row) => {
      const match = goals.find((goal) => goal.name === row.label);
      return match ? { ...row, value: String(match.monthlyContribution ?? match.targetAmount ?? "") } : row;
    }),
    cashflow: calculated("cashflow", cashflowValues),
    annual: calculated("annual", {
      "הכנסה שנתית": String(income * 12),
      "הוצאה שנתית": String(expenses * 12),
      "תזרים נטו": String((income - expenses) * 12),
      "שיעור חיסכון": income ? `${Math.round(((income - expenses) / income) * 100)}%` : "0%",
    }),
    calculators: calculated("calculators", {
      "שווי הנכס היום": String(homeValue),
      "יתרת המשכנתא": String(mortgage),
      "LTV — אחוז המימון הנוכחי": homeValue ? `${Math.round((mortgage / homeValue) * 100)}%` : "0%",
      "הון עצמי זמין": String(Math.max(0, homeValue - mortgage)),
      "נטל מההכנסה החודשית": income ? `${Math.round((mortgage / income) * 100)}%` : "0%",
    }),
  };
}
export async function saveWorkbook(data: WorkbookData): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ok = await pushBlob("family_workbook", data, getHouseholdId());
  if (ok) window.dispatchEvent(new Event("verdant:family_workbook:updated"));
  return ok;
}
export function updateWorkbookRow(data: WorkbookData, tab: string, id: string, value: string): WorkbookData {
  return { ...data, [tab]: (data[tab] || []).map((row) => row.id === id ? { ...row, value } : row) };
}
export function updateWorkbookCell(data: WorkbookData, tab: string, id: string, index: number, value: string): WorkbookData {
  return { ...data, [tab]: (data[tab] || []).map((row) => row.id === id ? { ...row, cells: (row.cells || Array.from({ length: 24 }, () => "")).map((cell, i) => i === index ? value : cell) } : row) };
}

/** Bridge questionnaire edits into the site's canonical onboarding stores. */
export function syncWorkbookRowToSite(tab: string, row: WorkbookRow, value: string): void {
  if (typeof window === "undefined") return;
  const read = <T,>(key: string, fallback: T): T => {
    try { const raw = localStorage.getItem(scopedKey(key)); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
  };
  if (tab === "mapping") {
    const budgets = loadBudgets();
    const aliases: Record<string, string> = {
      "מזון לבית": "מזון וצריכה",
      "מזון לבית (סופר)": "מזון וצריכה",
      "משכנתא / שכר דירה": "דיור ומגורים",
      "תקשורת (סלולר, אינטרנט, טלוויזיה)": "תקשורת",
      "חינוך וחוגים": "חינוך",
      "בריאות (קבוע)": "בריאות",
      "תחבורה (דלק, חניה, תחב״צ)": "תחבורה",
    };
    const siteLabel = aliases[row.label] || row.label;
    const next = budgets.map((budget) => budget.label === siteLabel ? { ...budget, budget: Number(value) || 0 } : budget);
    if (next.some((budget, index) => budget !== budgets[index])) saveBudgets(next);
    return;
  }
  if (tab === "goals") {
    try {
      const key = scopedKey("verdant:buckets");
      const current = read<Array<Record<string, unknown>>>("verdant:buckets", []);
      const next = current.map((goal) => goal.name === row.label
        ? { ...goal, monthlyContribution: Number(value) || 0, updatedAt: new Date().toISOString() }
        : goal);
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("verdant:goals:updated"));
    } catch { /* keep workbook usable when a legacy goal shape is present */ }
    return;
  }
  if (tab === "debts") {
    const debt = loadDebtData();
    const firstLoan = debt.loans[0];
    if (firstLoan && row.label === "החזר חודשי") {
      saveDebtData({ ...debt, loans: debt.loans.map((loan, index) => index === 0 ? { ...loan, monthlyPayment: Number(value) || 0 } : loan) });
    }
    return;
  }
  if (tab !== "questionnaire") return;
  const fields = read<Record<string, string>>("verdant:onboarding:fields", {});
  const fieldMap: Record<string, string> = {
    "שם בן/בת זוג 1": "p1_name",
    "שם בן/בת זוג 2": "p2_name",
    "מספר ילדים": "has_children",
    "רמת ידע פיננסי": "financial_knowledge",
    "רמת ידע בשוק ההון (מצוין/טוב/בינוני/אין)": "financial_knowledge",
    "רמת אהבת סיכון": "risk_tolerance",
    "עד כמה אוהבים סיכון?": "risk_tolerance",
    "מה הכי מטריד אתכם בכסף היום?": "money_concern",
    "מה הציפיות מהתהליך?": "process_expectations",
  };
  const field = fieldMap[row.label];
  if (field) fields[field] = value;
  if (row.label === "מספר ילדים") fields.has_children = Number(value) > 0 ? "1" : "0";
  localStorage.setItem(scopedKey("verdant:onboarding:fields"), JSON.stringify(fields));

  if (row.label === "הכנסה חודשית נטו — משפחתית") {
    localStorage.setItem(scopedKey("verdant:onboarding:incomes"), JSON.stringify([{ label: "הכנסה משפחתית", value }]));
    const assumptions = loadAssumptions();
    saveAssumptions({ ...assumptions, monthlyIncome: Number(value) || 0 });
  }
  if (row.label === "הוצאות חודשיות — להערכתכם") {
    const assumptions = loadAssumptions();
    saveAssumptions({ ...assumptions, monthlyExpenses: Number(value) || 0 });
  }
  window.dispatchEvent(new Event("verdant:onboarding:updated"));
  window.dispatchEvent(new Event("verdant:assumptions:updated"));
  pushOnboardingSnapshot();
}
