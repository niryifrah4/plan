import * as XLSX from "xlsx";
import { fillTemplate } from "../lib/family-workbook-export";

const source = XLSX.readFile("frontend/public/family-workbook-template.xlsx", { cellStyles: true });
const result = fillTemplate(source, {
  questionnaire: [{ id: "sample", label: "שם בן/בת זוג 1", value: "רועי E2E" }],
  cashflow: [{ id: "income", label: "משכורת / הכנסה 1", value: "", cells: ["32500", ...Array(23).fill("")] }],
  business: [{ id: "business-income", label: "הכנסות תפעוליות", value: "", cells: ["12000", ...Array(23).fill("")] }],
});

if (result.Sheets["שאלון"]?.C6?.v !== "רועי E2E") {
  throw new Error("Template injection failed: שאלון!C6");
}
if (result.SheetNames.length !== 12) throw new Error("Template must contain 12 sheets");
if (result.Sheets["תזרים"]?.C6?.v !== "32500") throw new Error("Template injection failed: תזרים!C6");
if (result.Sheets["עסק"]?.C5?.v !== "12000") throw new Error("Template injection failed: עסק!C5");
console.log("family workbook template verified: 12 sheets, questionnaire, cashflow, business populated");
