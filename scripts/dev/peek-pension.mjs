import fs from "fs";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
const buf = fs.readFileSync(
  "/Users/niryifrah/Desktop/ליווים/תני וגל/גל/פנסיה - דיוור שנתי מפורט.pdf"
);
const data = await pdfParse(buf);
const text = data.text;
// Find returns section
const idx = text.indexOf("תשואה");
console.log("=== returns context ===");
console.log(text.slice(idx, idx + 1500));
