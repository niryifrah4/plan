import fs from "fs";
const { parseExcel } = await import("./lib/doc-parser/parse-excel.ts");
const files = [
  "/Users/niryifrah/Desktop/ליווים/תני וגל/תני/wetransfer_banking_identity-4-pdf_2026-04-08_1322/פירוט עסקאות וזיכויים.xlsx",
  "/Users/niryifrah/Desktop/ליווים/תני וגל/תני/wetransfer_banking_identity-4-pdf_2026-04-08_1322/עובר ושב_08042026_1434.xlsx",
  "/Users/niryifrah/Desktop/ליווים/יעל גוסין /עו״ש.xls",
  "/Users/niryifrah/Desktop/ליווים/רזו ואסף/עו״ש - 49541 (אסף)/עוש - 49541.xlsx",
];
for (const f of files) {
  console.log("\n══════════════════════════════════════════");
  console.log("FILE:", f.split("/").pop());
  const buf = fs.readFileSync(f);
  const r = parseExcel(buf, f.split("/").pop());
  console.log("bank:", r.bankHint);
  console.log("rows:", r.transactions.length);
  console.log("date range:", r.dateRange.from, "→", r.dateRange.to);
  console.log("total expense:", r.totalDebit.toFixed(2));
  console.log("total income:", r.totalCredit.toFixed(2));
  if (r.warnings.length) console.log("warnings:", r.warnings);
  console.log("first 3 rows:");
  r.transactions
    .slice(0, 3)
    .forEach((t) =>
      console.log(" ", t.date, "|", String(t.description).slice(0, 40), "|", t.amount)
    );
  console.log("last 2 rows:");
  r.transactions
    .slice(-2)
    .forEach((t) =>
      console.log(" ", t.date, "|", String(t.description).slice(0, 40), "|", t.amount)
    );
  if (r.instruments?.length)
    console.log(
      "instruments:",
      r.instruments.map((i) => i.label)
    );
}
