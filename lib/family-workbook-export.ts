import * as XLSX from "xlsx";
import type { WorkbookData } from "./family-workbook";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function buildFamilyWorkbookXlsx(data: WorkbookData): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  const tabs = [
    ["home", "בית"], ["questionnaire", "שאלון"], ["mapping", "מיפוי"], ["debts", "חובות"],
    ["balance", "מאזן"], ["goals", "מטרות ויעדים"], ["cashflow", "תזרים"], ["business", "עסק"],
    ["annual", "סיכום שנתי"], ["insights", "תובנות"], ["journal", "יומן ליווי"], ["calculators", "מחשבונים"],
  ] as const;
  for (const [id, label] of tabs) {
    const rows = data[id] || [];
    const monthly = id === "cashflow" || id === "business";
    const values = monthly
      ? [["קטגוריה", ...MONTHS.flatMap((month) => [`${month} — תכנון`, `${month} — ביצוע`])], ...rows.map((row) => [row.label, ...(row.cells || Array.from({ length: 24 }, () => ""))])]
      : [["סעיף", "ערך / תכנון", "הערות"], ...rows.map((row) => [row.label, row.value, row.note || ""])];
    const sheet = XLSX.utils.aoa_to_sheet(values);
    sheet["!views"] = [{ rightToLeft: true }];
    sheet["!cols"] = monthly ? [{ wch: 28 }, ...Array.from({ length: 24 }, () => ({ wch: 12 }))] : [{ wch: 38 }, { wch: 18 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(book, sheet, label);
  }
  return book;
}

export function writeFamilyWorkbookXlsx(data: WorkbookData, familyName: string): void {
  XLSX.writeFile(buildFamilyWorkbookXlsx(data), `חוברת-משפחה-${familyName || "לקוח"}.xlsx`);
}
