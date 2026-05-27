/**
 * ═══════════════════════════════════════════════════════════
 *  Excel Export — דוח התוכנית המלאה כקובץ .xlsx
 * ═══════════════════════════════════════════════════════════
 *
 * Per Nir 2026-05-27 (§6.4): one-click export of the active household's
 * full financial picture to Excel. Mirrors the PDF report at /report
 * but in a format the client can re-open, edit, share by email, or
 * import to their own tools.
 *
 * Pulls from every store via existing load* functions — no Supabase
 * round-trip, no new API route. Client-side only. The xlsx dep is
 * already in the bundle (used by the bank-statement parser).
 *
 * Sheets:
 *   1. תקציר        — net worth + monthly cashflow + savings rate
 *   2. תקציב        — current-month rows: income / fixed / variable
 *   3. נכסים        — banks / securities / pension / real estate / kids
 *   4. חובות        — mortgage tracks + loans + installments
 *   5. פנסיה        — fund-by-fund balances + ownership + type
 *   6. נדל"ן        — properties with value / rent / mortgage / equity
 *   7. מטרות        — buckets with target / saved / monthly contribution
 *
 * Triggers a browser download — no server involved.
 */

import * as XLSX from "xlsx";
import { loadAccounts, totalBankBalance, totalCreditCharges } from "./accounts-store";
import { loadPensionFunds } from "./pension-store";
import { loadProperties } from "./realestate-store";
import { loadDebtData, getDebtSummary, getAllMortgageTracks } from "./debt-store";
import { loadBuckets } from "./buckets-store";
import { loadSecurities, totalSecuritiesValue } from "./securities-store";
import { loadKidsSavings } from "./kids-savings-store";
import { loadAssumptions, savingsRatio } from "./assumptions";
import { buildBudgetLines, deriveMonthlyIncomeFromBudget, deriveMonthlyExpensesFromBudget } from "./budget-store";

const ILS_FMT = '#,##0" ₪"';
const PCT_FMT = "0.0%";

/** Today as YYYY-MM-DD for the filename. */
function isoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Apply a number-format to every cell in a column (skipping the header). */
function formatColumn(ws: XLSX.WorkSheet, col: string, format: string): void {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const ref = `${col}${r + 1}`;
    if (ws[ref]) ws[ref].z = format;
  }
}

function styleSheet(ws: XLSX.WorkSheet, widths: number[]): void {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
}

/** Map pension type code → Hebrew label. Keeps the export self-explanatory. */
function pensionTypeLabel(t: string | undefined): string {
  switch (t) {
    case "pension":
      return "פנסיה";
    case "gemel":
      return "גמל";
    case "hishtalmut":
      return "השתלמות";
    case "bituach":
      return "ביטוח מנהלים";
    default:
      return "—";
  }
}

interface SummaryRow {
  סעיף: string;
  ערך: number | string;
}

function buildSummarySheet(familyName: string): XLSX.WorkSheet {
  const accounts = loadAccounts();
  const securities = totalSecuritiesValue(loadSecurities());
  const pensionFunds = loadPensionFunds();
  const pensionTotal = pensionFunds.reduce((s, f) => s + (f.balance || 0), 0);
  const properties = loadProperties();
  const realEstateValue = properties.reduce((s, p) => s + (p.currentValue || 0), 0);
  const kidsSavings = loadKidsSavings();
  const kidsTotal = kidsSavings.reduce((s, k) => s + (k.currentBalance || 0), 0);
  const liquid = totalBankBalance(accounts);
  const creditCharges = totalCreditCharges(accounts);
  const debt = loadDebtData();
  const debtSummary = getDebtSummary(debt, loadAssumptions().primeRate);
  // Installments have no aggregate "balance" field on the type; we compute
  // remaining-from-now as (totalPayments - currentPayment) * monthlyAmount.
  const installmentBalance = (debt.installments || []).reduce((s, i) => {
    const remaining = Math.max(0, (i.totalPayments || 0) - (i.currentPayment || 0));
    return s + remaining * (i.monthlyAmount || 0);
  }, 0);
  const totalDebt = debtSummary.mortgageBalance + debtSummary.loansBalance + installmentBalance;
  const totalAssets = liquid + securities + pensionTotal + realEstateValue + kidsTotal;
  const netWorth = totalAssets - totalDebt - creditCharges;

  // BudgetLine is EXPENSE-only (per-category vs actual). Income lives in
  // the monthly snapshot's `sections.income[]` and is summed by the helper.
  const income = deriveMonthlyIncomeFromBudget(0);
  const expenses = deriveMonthlyExpensesFromBudget(0);
  const rate = savingsRatio(income, expenses);

  const today = new Date().toLocaleDateString("he-IL");
  const rows: SummaryRow[] = [
    { סעיף: "תאריך הפקה", ערך: today },
    { סעיף: "משפחה", ערך: familyName || "—" },
    { סעיף: "", ערך: "" },
    { סעיף: "── שווי נטו ──", ערך: "" },
    { סעיף: "סך נכסים", ערך: totalAssets },
    { סעיף: "סך חובות", ערך: totalDebt },
    { סעיף: "חיובי אשראי לא משולמים", ערך: creditCharges },
    { סעיף: "שווי נטו", ערך: netWorth },
    { סעיף: "", ערך: "" },
    { סעיף: "── תזרים חודשי ──", ערך: "" },
    { סעיף: "הכנסה חודשית (תקציב)", ערך: income },
    { סעיף: "הוצאה חודשית (תקציב)", ערך: expenses },
    { סעיף: "פנוי לחיסכון", ערך: income - expenses },
    { סעיף: "אחוז חיסכון", ערך: rate },
    { סעיף: "", ערך: "" },
    { סעיף: "── התפלגות נכסים ──", ערך: "" },
    { סעיף: "נזיל (עו״ש + פיקדונות)", ערך: liquid },
    { סעיף: "ניירות ערך / תיק עצמאי", ערך: securities },
    { סעיף: "פנסיוני (קופות + השתלמות + גמל)", ערך: pensionTotal },
    { סעיף: "נדל״ן (שווי שוק)", ערך: realEstateValue },
    { סעיף: "חיסכון לכל ילד", ערך: kidsTotal },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [40, 18]);
  formatColumn(ws, "B", ILS_FMT);
  const rateRowIdx = rows.findIndex((r) => r.סעיף === "אחוז חיסכון");
  if (rateRowIdx >= 0) {
    const ref = `B${rateRowIdx + 2}`;
    if (ws[ref]) ws[ref].z = PCT_FMT;
  }
  return ws;
}

function buildBudgetSheet(): XLSX.WorkSheet {
  const lines = buildBudgetLines(0);
  const income = deriveMonthlyIncomeFromBudget(0);
  const rows: Array<{
    קטגוריה: string;
    תיאור: string;
    תקציב: number;
    בפועל: number;
    "נשאר/חריגה": number;
  }> = [];
  if (income > 0) {
    rows.push({
      קטגוריה: "הכנסה",
      תיאור: "סך הכנסות חודשיות",
      תקציב: income,
      בפועל: income,
      "נשאר/חריגה": 0,
    });
  }
  for (const l of lines) {
    rows.push({
      קטגוריה: l.kind === "fixed" ? "הוצאה קבועה" : "הוצאה משתנה",
      תיאור: l.label,
      תקציב: l.budget,
      בפועל: l.actual,
      "נשאר/חריגה": l.remaining,
    });
  }
  if (rows.length === 0)
    rows.push({
      קטגוריה: "—",
      תיאור: "אין שורות תקציב להחודש הנוכחי",
      תקציב: 0,
      בפועל: 0,
      "נשאר/חריגה": 0,
    });
  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [16, 28, 14, 14, 14]);
  for (const col of ["C", "D", "E"]) formatColumn(ws, col, ILS_FMT);
  return ws;
}

function buildAssetsSheet(): XLSX.WorkSheet {
  const accounts = loadAccounts();
  const securities = loadSecurities();
  const pensionFunds = loadPensionFunds();
  const properties = loadProperties();
  const kidsSavings = loadKidsSavings();

  const rows: Array<{ קבוצה: string; פריט: string; יתרה: number }> = [];

  for (const b of accounts.banks || []) {
    rows.push({
      קבוצה: "בנק",
      פריט: `${b.bankName || "—"}${b.accountNumber ? ` · ${b.accountNumber}` : ""}`,
      יתרה: b.balance || 0,
    });
  }
  for (const s of securities) {
    rows.push({
      קבוצה: "ניירות ערך",
      פריט: `${s.symbol || "—"}${s.broker ? ` · ${s.broker}` : ""}`,
      // market_value_ils is precomputed by the securities store (handles FX).
      יתרה: s.market_value_ils || 0,
    });
  }
  for (const p of pensionFunds) {
    rows.push({
      קבוצה: `פנסיוני · ${pensionTypeLabel(p.type)}`,
      פריט: `${p.company || ""} ${p.track || ""}`.trim() || "—",
      יתרה: p.balance || 0,
    });
  }
  for (const re of properties) {
    rows.push({
      קבוצה: "נדל״ן",
      פריט: `${re.name || re.type || "נכס"}${re.city ? ` · ${re.city}` : ""}`,
      יתרה: re.currentValue || 0,
    });
  }
  for (const k of kidsSavings) {
    rows.push({
      קבוצה: "חיסכון לילד",
      פריט: k.childName || "—",
      יתרה: k.currentBalance || 0,
    });
  }
  if (rows.length === 0) rows.push({ קבוצה: "—", פריט: "אין נכסים רשומים", יתרה: 0 });

  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [22, 42, 16]);
  formatColumn(ws, "C", ILS_FMT);
  return ws;
}

function buildDebtSheet(): XLSX.WorkSheet {
  const debt = loadDebtData();
  const rows: Array<{ סוג: string; שם: string; יתרה: number; "החזר חודשי": number }> = [];

  const tracks = getAllMortgageTracks(debt);
  for (const t of tracks) {
    rows.push({
      סוג: `משכנתא · ${t.indexation || "—"}`,
      שם: t.name || "—",
      יתרה: t.remainingBalance || 0,
      "החזר חודשי": t.monthlyPayment || 0,
    });
  }
  for (const l of debt.loans || []) {
    // Loan doesn't carry a remainingBalance — approximate from
    // (totalPayments - elapsed) * monthlyPayment. Falls back to 0 when
    // startDate is missing.
    const balance = (l.monthlyPayment || 0) * (l.totalPayments || 0);
    rows.push({
      סוג: "הלוואה",
      שם: l.lender || "—",
      יתרה: balance,
      "החזר חודשי": l.monthlyPayment || 0,
    });
  }
  for (const i of debt.installments || []) {
    const remaining = Math.max(0, (i.totalPayments || 0) - (i.currentPayment || 0));
    rows.push({
      סוג: "תשלומים",
      שם: i.merchant || "—",
      יתרה: remaining * (i.monthlyAmount || 0),
      "החזר חודשי": i.monthlyAmount || 0,
    });
  }
  if (rows.length === 0)
    rows.push({ סוג: "—", שם: "אין חובות רשומים", יתרה: 0, "החזר חודשי": 0 });

  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [22, 34, 16, 16]);
  formatColumn(ws, "C", ILS_FMT);
  formatColumn(ws, "D", ILS_FMT);
  return ws;
}

function buildPensionSheet(): XLSX.WorkSheet {
  const funds = loadPensionFunds();
  const rows = funds.map((f) => ({
    "בן זוג": f.owner === "spouse_b" ? "ב'" : f.owner === "joint" ? "משותף" : "א'",
    סוג: pensionTypeLabel(f.type),
    ספק: f.company || "—",
    מסלול: f.track || "—",
    יתרה: f.balance || 0,
    "דמי ניהול הפקדה": f.mgmtFeeDeposit || 0,
    "דמי ניהול יתרה": f.mgmtFeeBalance || 0,
  }));
  if (rows.length === 0)
    rows.push({
      "בן זוג": "—",
      סוג: "—",
      ספק: "—",
      מסלול: "אין קופות פנסיוניות רשומות",
      יתרה: 0,
      "דמי ניהול הפקדה": 0,
      "דמי ניהול יתרה": 0,
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [10, 16, 18, 22, 16, 18, 18]);
  formatColumn(ws, "E", ILS_FMT);
  formatColumn(ws, "F", PCT_FMT);
  formatColumn(ws, "G", PCT_FMT);
  return ws;
}

function buildRealEstateSheet(): XLSX.WorkSheet {
  const properties = loadProperties();
  const rows = properties.map((p) => ({
    נכס: p.name || "—",
    סוג: p.type === "residence" ? "מגורים" : p.type === "investment" ? "השקעה" : p.type || "—",
    "דירה יחידה": p.isPrimaryResidence ? "כן" : "לא",
    "תאריך רכישה": p.purchaseDate || "—",
    "מחיר רכישה": p.purchasePrice || 0,
    "שווי נוכחי": p.currentValue || 0,
    "שכ״ד חודשי": p.monthlyRent || 0,
    "יתרת משכנתא": p.mortgageBalance || 0,
    הון: (p.currentValue || 0) - (p.mortgageBalance || 0),
    "כלול בפרישה": p.includeInRetirement ? "כן" : "לא",
  }));
  if (rows.length === 0)
    rows.push({
      נכס: "—",
      סוג: "—",
      "דירה יחידה": "—",
      "תאריך רכישה": "—",
      "מחיר רכישה": 0,
      "שווי נוכחי": 0,
      "שכ״ד חודשי": 0,
      "יתרת משכנתא": 0,
      הון: 0,
      "כלול בפרישה": "—",
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [28, 12, 12, 14, 14, 14, 14, 14, 14, 14]);
  for (const col of ["E", "F", "G", "H", "I"]) formatColumn(ws, col, ILS_FMT);
  return ws;
}

function buildGoalsSheet(): XLSX.WorkSheet {
  const buckets = loadBuckets();
  const rows = buckets.map((b) => ({
    שם: b.name || "—",
    "סכום יעד": b.targetAmount || 0,
    "סכום נצבר": b.currentAmount || 0,
    "הפקדה חודשית": b.monthlyContribution || 0,
    "תאריך יעד": b.targetDate || "—",
    "עדיפות": b.priority === "high" ? "גבוהה" : b.priority === "low" ? "נמוכה" : "בינונית",
  }));
  if (rows.length === 0)
    rows.push({
      שם: "אין מטרות רשומות",
      "סכום יעד": 0,
      "סכום נצבר": 0,
      "הפקדה חודשית": 0,
      "תאריך יעד": "—",
      "עדיפות": "—",
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  styleSheet(ws, [28, 16, 16, 18, 14, 12]);
  for (const col of ["B", "C", "D"]) formatColumn(ws, col, ILS_FMT);
  return ws;
}

/**
 * Build the workbook and trigger a browser download.
 * Called from a button click — never runs on the server.
 */
export function exportFullPlanToExcel(familyName: string): void {
  if (typeof window === "undefined") return;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(familyName), "תקציר");
  XLSX.utils.book_append_sheet(wb, buildBudgetSheet(), "תקציב");
  XLSX.utils.book_append_sheet(wb, buildAssetsSheet(), "נכסים");
  XLSX.utils.book_append_sheet(wb, buildDebtSheet(), "חובות");
  XLSX.utils.book_append_sheet(wb, buildPensionSheet(), "פנסיה");
  XLSX.utils.book_append_sheet(wb, buildRealEstateSheet(), "נדלן");
  XLSX.utils.book_append_sheet(wb, buildGoalsSheet(), "מטרות");

  // Hebrew RTL layout hint for Windows Excel.
  (wb as XLSX.WorkBook & { Workbook?: { Views?: { RTL: boolean }[] } }).Workbook = {
    Views: [{ RTL: true }],
  };

  const safeFamily = (familyName || "פלאן").replace(/[^֐-׿a-zA-Z0-9_-]/g, "_") || "פלאן";
  const filename = `plan_${safeFamily}_${isoDate()}.xlsx`;
  XLSX.writeFile(wb, filename);
}
