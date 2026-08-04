import * as XLSX from "xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { WorkbookData } from "./family-workbook";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const TEMPLATE_URL = "/family-workbook-template.xlsx";

function putValue(sheet: XLSX.WorkSheet, row: number, col: number, value: string): void {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  // Keep the template cell's style, number format, protection and alignment.
  // Replacing the cell object outright silently strips the Excel formatting.
  sheet[address] = { ...(sheet[address] || {}), t: "s", v: value };
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
    if (id === "home") {
      // Home is a calculated dashboard in the template, not an editable tab.
      // Feed its KPI cells from the canonical workbook tabs so it never exports
      // the template's placeholder zeroes.
      const value = (tab: string, label: string) => data[tab]?.find((row) => row.label === label)?.value || "";
      const cashflow = value("cashflow", "תזרים נטו") || value("annual", "תזרים נטו");
      const emergency = value("insights", "כרית חירום (חודשים)");
      const goals = value("insights", "% מהמטרות שמומן") || value("insights", "מימון המטרות");
      if (cashflow) putValue(sheet, 4, 1, cashflow);
      if (emergency) putValue(sheet, 4, 3, emergency);
      if (goals) putValue(sheet, 4, 5, goals);
      const year = value("cashflow", "שנה") || value("annual", "שנה");
      if (year) putValue(sheet, 20, 4, year);
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
      // Excel's loan table is horizontal: one loan occupies B:F on row 6.
      // The workbook UI stores the fields as labelled rows.
      const field = (label: string) => rows.find((row) => row.label === label)?.value || "";
      const loan = [["שם ההלוואה / הבנק", 1], ["יתרת קרן", 2], ["ריבית שנתית", 3], ["החזר חודשי", 4], ["חודשים שנותרו", 5]] as const;
      const fixedValues = new Map(loan.map(([labelName, col]) => [col, field(labelName)]));
      loan.forEach(([, col]) => {
        const value = fixedValues.get(col);
        if (value) putValue(sheet, 5, col, value);
      });

      // Custom rows are valid workbook entries too. The template has one
      // primary-loan row, so use a custom row as a fallback when no canonical
      // lender/payment pair exists; otherwise it silently disappears on export.
      if (!fixedValues.get(1) && !fixedValues.get(4)) {
        const custom = rows.find((row) =>
          row.value && row.note === "החזר חודשי" && !["הלוואות", "מחשבון איחוד הלוואות"].includes(row.label),
        );
        if (custom) {
          putValue(sheet, 5, 1, custom.label);
          putValue(sheet, 5, 4, custom.value);
        }
      }
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
    if (id === "journal") {
      const start = rows.find((row) => row.label === "תאריך תחילת הליווי");
      if (start) putValue(sheet, 2, 2, start.value);
      for (let meeting = 1; meeting <= 5; meeting++) {
        const base = 5 + (meeting - 1) * 9;
        const fields: Array<[string, number, number]> = [
          [`פגישה ${meeting} — תאריך`, base, 2],
          [`פגישה ${meeting} — נושא`, base, 4],
          [`פגישה ${meeting} — מה סוכם`, base + 1, 2],
          [`פגישה ${meeting} — משימות עד הפגישה הבאה`, base + 3, 2],
          [`פגישה ${meeting} — מה לקחנו מהפגישה`, base + 5, 2],
        ];
        for (const [labelName, targetRow, targetCol] of fields) {
          const row = rows.find((candidate) => candidate.label === labelName);
          if (row) putValue(sheet, targetRow, targetCol, row.value);
        }
      }
    }
    if (id === "questionnaire") {
      const spouse1 = rows.find((row) => row.label === "שם בן/בת זוג 1");
      const spouse2 = rows.find((row) => row.label === "שם בן/בת זוג 2");
      if (spouse1?.value) putValue(sheet, 5, 2, spouse1.value);
      if (spouse2?.value) putValue(sheet, 5, 3, spouse2.value);
    }
    for (const row of rows) {
      if (monthly && (id === "cashflow" || id === "business")) continue;
      if (id === "debts" || id === "goals" || id === "journal") continue;
      const aliases: Record<string, string> = id === "questionnaire"
        ? { "שם בן/בת זוג 1": "שם מלא" }
        : id === "balance"
          ? { "עו״ש ופיקדונות": "עו\"ש ופיקדונות" }
          : id === "calculators"
            ? { "LTV — אחוז המימון הנוכחי": "◄ LTV — אחוז המימון הנוכחי" }
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
  const templateResponse = await fetch(TEMPLATE_URL);
  if (!templateResponse.ok) throw new Error("family_workbook_template_unavailable");
  const templateBuffer = await templateResponse.arrayBuffer();
  const book = fillTemplate(
    XLSX.read(templateBuffer, { type: "array", cellStyles: true }),
    data,
  );
  const archive = unzipSync(new Uint8Array(templateBuffer));
  for (let sheetIndex = 0; sheetIndex < 12; sheetIndex++) {
    const sheet = book.Sheets[book.SheetNames[sheetIndex]];
    const file = archive[`xl/worksheets/sheet${sheetIndex + 1}.xml`];
    if (!sheet || !file) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    let xmlText = strFromU8(file);
    for (let row = range.s.r; row <= range.e.r; row++) for (let col = range.s.c; col <= range.e.c; col++) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[ref] as XLSX.CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === "") continue;
      // Keep the formula from the original template. Replacing a formula cell
      // with its cached value turns the workbook into a static snapshot.
      if (cell.f) continue;
      const value = String(cell.v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      const numeric = typeof cell.v === "number" && Number.isFinite(cell.v);
      const pattern = new RegExp(`<c\\b([^>]*\\br="${ref}"[^>]*)>(?:[\\s\\S]*?<\\/c>)?`);
      xmlText = xmlText.replace(pattern, (_whole, attrs: string) => {
        const kept = attrs.replace(/\s+t="[^"]*"/g, "");
        return numeric ? `<c${kept} t="n"><v>${cell.v}</v></c>` : `<c${kept} t="inlineStr"><is><t>${value}</t></is></c>`;
      });
    }
    archive[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = strToU8(xmlText);
  }
  const output = new Blob([zipSync(archive, { level: 6 })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(output);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `חוברת-משפחה-${familyName || "לקוח"}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
