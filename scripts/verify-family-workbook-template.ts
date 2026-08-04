import * as XLSX from "xlsx";
import { fillTemplate } from "../lib/family-workbook-export";

const source = XLSX.readFile("frontend/public/family-workbook-template.xlsx", { cellStyles: true });
const result = fillTemplate(source, {
  questionnaire: [{ id: "sample", label: "שם בן/בת זוג 1", value: "רועי E2E" }],
  cashflow: [{ id: "income", label: "משכורת / הכנסה 1", value: "", cells: ["32500", ...Array(23).fill("")] }],
  business: [{ id: "business-income", label: "הכנסות תפעוליות", value: "", cells: ["12000", ...Array(23).fill("")] }],
  debts: [
    { id: "loan-name", label: "שם ההלוואה / הבנק", value: "בנק E2E" },
    { id: "loan-payment", label: "החזר חודשי", value: "4500" },
  ],
  goals: [{ id: "goal", label: "קרן חירום", value: "1800" }],
  balance: [{ id: "asset", label: "עו״ש ופיקדונות", value: "25000" }],
  journal: [
    { id: "meeting-date", label: "פגישה 1 — תאריך", value: "2026-08-04" },
    { id: "meeting-topic", label: "פגישה 1 — נושא", value: "בדיקת תזרים" },
  ],
  annual: [{ id: "annual-income", label: "הכנסה שנתית", value: "390000" }],
  insights: [{ id: "net-worth", label: "שווי נקי", value: "120000" }],
  calculators: [{ id: "ltv", label: "LTV — אחוז המימון הנוכחי", value: "45%" }],
});

if (result.Sheets["שאלון"]?.C6?.v !== "רועי E2E") {
  throw new Error("Template injection failed: שאלון!C6");
}
if (result.SheetNames.length !== 12) throw new Error("Template must contain 12 sheets");
if (result.Sheets["תזרים"]?.C6?.v !== "32500") throw new Error("Template injection failed: תזרים!C6");
if (result.Sheets["עסק"]?.C5?.v !== "12000") throw new Error("Template injection failed: עסק!C5");
if (result.Sheets["חובות"]?.B6?.v !== "בנק E2E" || result.Sheets["חובות"]?.E6?.v !== "4500") throw new Error("Template injection failed: חובות!B6:E6");
const customDebtResult = fillTemplate(source, {
  debts: [{ id: "custom-loan", label: "הלוואה משפחתית", value: "1800", note: "החזר חודשי" }],
});
if (customDebtResult.Sheets["חובות"]?.B6?.v !== "הלוואה משפחתית" || customDebtResult.Sheets["חובות"]?.E6?.v !== "1800") {
  throw new Error("Template injection failed: custom debt row");
}
const sectionResult = fillTemplate(source, {
  mapping: [{ id: "annual-section", label: "הוצאות שנתיות (חלוקה חודשית)", value: "נתן דוגמה 23" }],
});
if (sectionResult.Sheets["מיפוי"]?.C30?.v === "נתן דוגמה 23") {
  throw new Error("Demo data leaked into section row: מיפוי!C30");
}
if (result.Sheets["מטרות ויעדים"]?.B5?.v !== "קרן חירום" || result.Sheets["מטרות ויעדים"]?.N5?.v !== "1800") throw new Error("Template injection failed: מטרות ויעדים!B5:N5");
if (result.Sheets["מאזן"]?.C6?.v !== "25000") throw new Error("Template injection failed: מאזן!C6");
if (result.Sheets["יומן ליווי"]?.C6?.v !== "2026-08-04" || result.Sheets["יומן ליווי"]?.E6?.v !== "בדיקת תזרים") throw new Error("Template injection failed: יומן ליווי");
if (result.Sheets["סיכום שנתי"]?.C4?.v !== "390000") throw new Error("Template injection failed: סיכום שנתי");
if (result.Sheets["תובנות"]?.C4?.v !== "120000") throw new Error("Template injection failed: תובנות");
if (result.Sheets["מחשבונים"]?.C7?.v !== "45%") throw new Error("Template injection failed: מחשבונים");
console.log("family workbook template verified: 12 sheets, all editable domains populated");
