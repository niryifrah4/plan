import * as XLSX from "xlsx";
import { fillTemplate } from "../lib/family-workbook-export";

const source = XLSX.readFile("frontend/public/family-workbook-template.xlsx", { cellStyles: true });
const result = fillTemplate(source, {
  questionnaire: [{ id: "sample", label: "שם בן/בת זוג 1", value: "רועי E2E" }],
});

if (result.Sheets["שאלון"]?.C6?.v !== "רועי E2E") {
  throw new Error("Template injection failed: שאלון!C6");
}
if (result.SheetNames.length !== 12) throw new Error("Template must contain 12 sheets");
console.log("family workbook template verified: 12 sheets, שאלון!C6 populated");
