import * as XLSX from "xlsx";
import type { WorkbookData } from "./family-workbook";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const TEMPLATE_URL = "/family-workbook-template.xlsx";

function putValue(sheet: XLSX.WorkSheet, row: number, col: number, value: string): void {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  sheet[address] = { t: "s", v: value };
}

export function fillTemplate(book: XLSX.WorkBook, data: WorkbookData): XLSX.WorkBook {
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
    if (id === "cashflow") {
      const inputRows = [
        ...Array.from({ length: 6 }, (_, i) => 5 + i),
        ...Array.from({ length: 18 }, (_, i) => 14 + i),
        ...Array.from({ length: 17 }, (_, i) => 35 + i),
      ];
      const sectionLabels = new Set(["תחילת פעילות — חודש", "שנה", "שנת פעילות", "הכנסות", "הוצאות קבועות", "הוצאות משתנות"]);
      const editable = rows.filter((row) => row.cells && !row.calculated && !sectionLabels.has(row.label) && !row.label.startsWith("סה״כ") && row.label !== "תזרים נטו" && row.label !== "מצטבר (ביצוע)" && !row.label.startsWith("כרית"));
      editable.slice(0, inputRows.length).forEach((row, index) => {
        for (let i = 0; i < 24; i++) putValue(sheet, inputRows[index], 2 + i, row.cells?.[i] || "");
      });
    }
    if (id === "business") {
      const inputRows = [4, 5, 6, 7, 9];
      rows.filter((row) => row.cells && !row.calculated && !row.label.startsWith("◄") && !row.label.startsWith("מצטבר")).slice(0, inputRows.length).forEach((row, index) => {
        for (let i = 0; i < 12; i++) putValue(sheet, inputRows[index], 2 + i, row.cells?.[i * 2] || "");
      });
    }
    if (id === "debts") {
      // Site bridge exposes active loans as lender label + monthly payment.
      // Excel keeps each loan across columns B:F, rows 6:15.
      rows.filter((row) => row.value && !row.calculated && row.label !== "הלוואות").slice(0, 10).forEach((row, index) => {
        const targetRow = 5 + index;
        putValue(sheet, targetRow, 1, row.label);
        putValue(sheet, targetRow, 4, row.value);
      });
    }
    if (id === "goals") {
      // Excel goal rows are formula-labelled from the questionnaire. Write
      // current site goal name + monthly allocation into the visible goal
      // table while preserving all surrounding formulas/styles.
      rows.filter((row) => row.value && !row.calculated && !["שנת הבסיס", "שנת יעד", "עלות היום"].includes(row.label)).slice(0, 12).forEach((row, index) => {
        const targetRow = 4 + index;
        putValue(sheet, targetRow, 1, row.label);
        putValue(sheet, targetRow, 13, row.value);
      });
    }
    for (const row of rows) {
      if (monthly && (id === "cashflow" || id === "business")) continue;
      if (id === "debts" || id === "goals") continue;
      const aliases: Record<string, string> = id === "questionnaire"
        ? { "שם בן/בת זוג 1": "שם מלא" }
        : id === "balance"
          ? { "עו״ש ופיקדונות": "עו\"ש ופיקדונות" }
          : {};
      const targetRow = labels.get(row.label) ?? labels.get(aliases[row.label] || "");
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
