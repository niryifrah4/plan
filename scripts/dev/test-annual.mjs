import fs from "fs";
const { parseAnnualReportBundle } = await import("./lib/doc-parser/annual-report-parser.ts");

const files = [
  "/Users/niryifrah/Desktop/ליווים/תני וגל/גל/גמל - דיוור שנתי מפורט.pdf",
  "/Users/niryifrah/Desktop/ליווים/תני וגל/גל/פנסיה - דיוור שנתי מפורט.pdf",
];
const bundle = await parseAnnualReportBundle(
  files.map((f) => ({ name: f.split("/").pop(), buffer: fs.readFileSync(f) }))
);
console.log("Customer:", bundle.customerName, "/", bundle.customerId);
console.log("Total balance:", bundle.totalBalance.toLocaleString());
console.log("Projected pension/mo:", bundle.totalProjectedPension.toLocaleString());
console.log("Monthly contrib:", bundle.totalMonthlyContrib.toLocaleString());
console.log("Warnings:", bundle.warnings.length, "items");
bundle.warnings.forEach((w) => console.log(" ⚠️", w));
for (const p of bundle.policies) {
  console.log("\n📋", p.providerName, "/", p.productTypeLabel, "— acct", p.accountNumber);
  console.log("   plan:", p.planName);
  console.log("   customer:", p.customerName, "(" + p.customerId + ")");
  console.log("   employer:", p.employerName, "| join:", p.joinDate);
  console.log("   reportDate:", p.reportDate);
  console.log("   balance:", p.balance?.toLocaleString());
  console.log(
    "   annualDeposits:",
    p.annualDeposits?.toLocaleString(),
    "| monthly:",
    p.monthlyContrib
  );
  console.log("   fees: bal%=", p.mgmtFeeBalance, " dep%=", p.mgmtFeeDeposit);
  console.log("   returns: 1Y=", p.returnYear, "%  5Y=", p.return5y, "%");
  console.log(
    "   pension projected:",
    p.projectedPensionAmount?.toLocaleString(),
    "@ age",
    p.retirementAge
  );
  console.log("   salary base:", p.salaryBase?.toLocaleString());
  if (p.notes) console.log("   notes:", p.notes);
}
