import * as XLSX from "xlsx";
import type { WorkbookData } from "./family-workbook";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const TEMPLATE_URL = "/family-workbook-template.xlsx";

function putValue(sheet: XLSX.WorkSheet, row: number, col: number, value: string): void {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  sheet[address] = { t: "s", v: value };
}

function fillTemplate(book: XLSX.WorkBook, data: WorkbookData): XLSX.WorkBook {
  const tabs = [
    ["home", "בית"], ["questionnaire", "שאלון"], ["mapping", "מיפוי"], ["debts", "חובות"],
    ["balance", "מאזן"], ["goals", "מטרות ויעדים"], ["cashflow", "תזרים"], ["business", "עסק"],
    ["annual", "סיכום שנתי"], ["insights", "תובנות"], ["journal", "יומן ליווי"], ["calculators", "מחשבונים"],
  ] as const;
  for (const [id, label] of tabs) {
    const sheet = book.Sheets[label];
    if (!sheet) continue;
    const rows = data[id] || [];
    const monthly = id === "cashflow" || id === "business";
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const labels = new Map<string, number>();
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 5); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (typeof cell?.v === "string" && cell.v.trim()) labels.set(cell.v.trim(), r);
      }
    }
    for (const row of rows) {
      const targetRow = labels.get(row.label);
      if (targetRow === undefined) continue;
      if (monthly) {
        for (let i = 0; i < 24; i++) putValue(sheet, targetRow, 2 + i, row.cells?.[i] || "");
      } else {
        putValue(sheet, targetRow, 2, row.value || "");
        if (row.note) putValue(sheet, targetRow, 4, row.note);
      }
    }
  }
  return book;
}

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

export async function writeFamilyWorkbookXlsx(data: WorkbookData, familyName: string): Promise<void> {
  let book: XLSX.WorkBook;
  try {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error(`Template HTTP ${response.status}`);
    book = fillTemplate(XLSX.read(await response.arrayBuffer(), { type: "array", cellStyles: true }), data);
  } catch {
    book = buildFamilyWorkbookXlsx(data);
  }
  XLSX.writeFile(book, `חוברת-משפחה-${familyName || "לקוח"}.xlsx`);
}
