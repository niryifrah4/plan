import { execFileSync } from "node:child_process";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { starter } from "../lib/family-workbook.js";
import { fillTemplate } from "../lib/family-workbook-export.js";
import { patchFamilyTemplate } from "../backend/src/lib/family-workbook-template-patch.js";

const templatePath = "frontend/public/family-workbook-template.xlsx";
const template = fs.readFileSync(templatePath);
const generated = fillTemplate(XLSX.read(template, { type: "buffer", cellStyles: true }), starter);
const output = patchFamilyTemplate(template, generated);
const outputPath = "/tmp/family-workbook-export-regression.xlsx";
fs.writeFileSync(outputPath, output);

const hash = (file: string, entry: string) => execFileSync("shasum", [], {
  input: execFileSync("unzip", ["-p", file, entry]),
}).toString().trim();

if (hash(templatePath, "xl/styles.xml") !== hash(outputPath, "xl/styles.xml")) {
  throw new Error("template_styles_changed");
}

const workbook = XLSX.read(output, { type: "buffer", cellStyles: true });
if (workbook.SheetNames.length !== 12) throw new Error("sheet_count_changed");
if (workbook.Sheets["מחשבונים"]?.F8?.f !== "N(F6)-N(F7)") throw new Error("formula_lost: מחשבונים!F8");
const cellXml = execFileSync("unzip", ["-p", outputPath, "xl/worksheets/sheet2.xml"]).toString();
if (!/<c r="C6" s="72"/.test(cellXml)) throw new Error("editable_cell_style_changed");
console.log("family workbook export verified: template styles and 12 sheets preserved");
