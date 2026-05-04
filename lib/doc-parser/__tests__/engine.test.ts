/**
 * Document Parser — Full Engine Tests (Velora-grade)
 * Run: npx tsx lib/doc-parser/__tests__/engine.test.ts
 */

import { matchSynonym, detectBank } from "../synonyms";
import { parseILNumber, parseILDate, cleanAmount } from "../number-utils";
import { categorize } from "../categorizer";
import { normalizeSupplier, isInternalTransfer, getTier, groupByTier } from "../normalizer";
import { detectRecurring } from "../recurring";
import { analyzeBurnRate } from "../burn-rate";
import type { ParsedTransaction } from "../types";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(
      `  ❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

console.log("\n═══ 1. Synonym Matching ═══");
assert("תאריך → date", matchSynonym("תאריך"), "date");
assert("תאריך פעולה → date", matchSynonym("תאריך פעולה"), "date");
assert("תאריך עסקה → date", matchSynonym("תאריך עסקה"), "date");
assert("תיאור → description", matchSynonym("תיאור"), "description");
assert("שם בית עסק → description", matchSynonym("שם בית עסק"), "description");
assert("פעולה → description", matchSynonym("פעולה"), "description");
assert("חובה → debit", matchSynonym("חובה"), "debit");
assert("סכום חיוב → debit", matchSynonym("סכום חיוב"), "debit");
assert("זכות → credit", matchSynonym("זכות"), "credit");
assert("סכום זיכוי → credit", matchSynonym("סכום זיכוי"), "credit");
assert("יתרה → balance", matchSynonym("יתרה"), "balance");
assert("unknown → null", matchSynonym("qqq"), null);
assert("empty → null", matchSynonym(""), null);
assert("סכום לחיוב → debit", matchSynonym("סכום לחיוב"), "debit");
assert('סכום העסקה בש"ח → debit', matchSynonym('סכום העסקה בש"ח'), "debit");
assert('סכום זיכוי בש"ח → credit', matchSynonym('סכום זיכוי בש"ח'), "credit");

console.log("\n═══ 2. Number Parsing ═══");
assert("1,500 → 1500", parseILNumber("1,500"), 1500);
assert("1,500.50 → 1500.5", parseILNumber("1,500.50"), 1500.5);
assert("-2,300 → -2300", parseILNumber("-2,300"), -2300);
assert("₪2,300 → 2300", parseILNumber("₪2,300"), 2300);
assert("-₪1,000 → -1000", parseILNumber("-₪1,000"), -1000);
assert("(1,000) → -1000", parseILNumber("(1,000)"), -1000);
assert("5,000- → -5000", parseILNumber("5,000-"), -5000);
assert("empty → 0", parseILNumber(""), 0);
assert("null → 0", parseILNumber(null), 0);
assert("dash → 0", parseILNumber("-"), 0);
assert("number passthrough", parseILNumber(42), 42);

console.log("\n═══ 2b. cleanAmount — Aggressive Sanitization ═══");
assert("₪1,250.50 → 1250.5", cleanAmount("₪1,250.50"), 1250.5);
assert("1,250.50- → -1250.5", cleanAmount("1,250.50-"), -1250.5);
assert("(3,400) → -3400", cleanAmount("(3,400)"), -3400);
assert("$150.00 → 150", cleanAmount("$150.00"), 150);
assert("-₪2,300 → -2300", cleanAmount("-₪2,300"), -2300);
assert("  1 250  → 1250", cleanAmount("  1 250  "), 1250);
assert("empty → 0", cleanAmount(""), 0);
assert("null → 0", cleanAmount(null), 0);
assert("dash → 0", cleanAmount("-"), 0);
assert("number passthrough", cleanAmount(42.5), 42.5);
assert("5,000- → -5000", cleanAmount("5,000-"), -5000);
assert("€1,500.75 → 1500.75", cleanAmount("€1,500.75"), 1500.75);
assert("NaN → 0", cleanAmount("abc"), 0);
assert("−1000 (unicode minus)", cleanAmount("−1,000"), -1000);

console.log("\n═══ 3. Date Parsing ═══");
assert("dd/mm/yyyy", parseILDate("15/03/2024"), "2024-03-15");
assert("d/m/yyyy", parseILDate("5/3/2024"), "2024-03-05");
assert("dd-mm-yyyy", parseILDate("15-03-2024"), "2024-03-15");
assert("dd.mm.yyyy", parseILDate("15.03.2024"), "2024-03-15");
assert("dd/mm/yy", parseILDate("15/03/24"), "2024-03-15");
assert("ISO passthrough", parseILDate("2024-03-15"), "2024-03-15");

console.log("\n═══ 4. Bank Detection ═══");
assert("הפועלים", detectBank("דף חשבון הפועלים"), "בנק הפועלים");
assert("לאומי", detectBank("בנק לאומי לישראל"), "בנק לאומי");
assert("ישראכרט", detectBank("ישראכרט בע״מ"), "ישראכרט");
assert("כאל", detectBank("כאל - כרטיסי אשראי"), "כאל");
assert("מקס", detectBank("מקס it"), "מקס");
assert("unknown", detectBank("random text"), "לא זוהה");

console.log("\n═══ 5. Auto-Categorization ═══");
assert("שופרסל → מזון", categorize("שופרסל דיל סניף 123").key, "food");
assert("רמי לוי → מזון", categorize("רמי לוי שיווק").key, "food");
assert("וולט → אוכל בחוץ", categorize("wolt delivery").key, "dining_out");
assert("תנובה → מזון", categorize("תנובה מרכז הפצה").key, "food");
assert("משכנתא → דיור", categorize("משכנתא חודשית").key, "housing");
assert("ארנונה → דיור", categorize("ארנונה עיריית תל אביב").key, "housing");
assert("מי אביבים → דיור", categorize("מי אביבים תשלום").key, "housing");
assert("חברת חשמל → דיור", categorize("חברת חשמל").key, "housing");
assert("פז → תחבורה", categorize("פז תחנת דלק").key, "transport");
assert("סונול → תחבורה", categorize("סונול צומת").key, "transport");
assert("gett → תחבורה", categorize("gett נסיעה").key, "transport");
assert("סלקום → שוטפים", categorize("סלקום תקשורת").key, "utilities");
assert("מכבי → בריאות", categorize("מכבי שירותי בריאות").key, "health");
assert("סופר פארם → בריאות", categorize("סופר פארם").key, "health");
assert("נטפליקס → פנאי", categorize("netflix.com").key, "leisure");
assert("ספוטיפיי → פנאי", categorize("spotify premium").key, "leisure");
assert("קולנוע → אוכל בחוץ", categorize("yes planet קולנוע").key, "dining_out");
assert("מסעדה → אוכל בחוץ", categorize("מסעדה יפנית").key, "dining_out");
assert("איקאה → קניות", categorize("איקאה ראשלצ").key, "shopping");
assert("ביט → העברות", categorize("ביט תשלום").key, "transfers");
assert("random → אחר", categorize("ABCXYZ").key, "other");

console.log("\n═══ 6. Supplier Normalization ═══");
assert("שופרסל דיל → שופרסל", normalizeSupplier("שופרסל דיל סניף 42"), "שופרסל");
assert("שופרסל אקספרס → שופרסל", normalizeSupplier("שופרסל אקספרס"), "שופרסל");
assert("רמי לוי שיווק → רמי לוי", normalizeSupplier("רמי לוי שיווק"), "רמי לוי");
assert("netflix → נטפליקס", normalizeSupplier("netflix.com"), "נטפליקס");
assert("spotify → ספוטיפיי", normalizeSupplier("spotify ab"), "ספוטיפיי");
assert("סופר-פארם → סופר פארם", normalizeSupplier("סופר-פארם"), "סופר פארם");
assert("unknown stays same", normalizeSupplier("ABC Corp"), "ABC Corp");

console.log("\n═══ 7. Internal Transfer Detection ═══");
assert("העברה בין חשבונות", isInternalTransfer("העברה בין חשבונות"), true);
assert("העברה פנימית", isInternalTransfer("העברה פנימית"), true);
assert("בית לבית", isInternalTransfer("בית לבית"), true);
assert("שופרסל = not", isInternalTransfer("שופרסל דיל"), false);
assert("משכורת = not", isInternalTransfer("משכורת חודשית"), false);

console.log("\n═══ 8. 3-Tier Hierarchy ═══");
assert("food → essential", getTier("food"), "essential");
assert("housing → essential", getTier("housing"), "essential");
assert("health → essential", getTier("health"), "essential");
assert("leisure → lifestyle", getTier("leisure"), "lifestyle");
assert("shopping → lifestyle", getTier("shopping"), "lifestyle");
assert("pension → growth", getTier("pension"), "growth");
assert("other → lifestyle", getTier("other"), "lifestyle");

console.log("\n═══ 9. Recurring Detection ═══");
const recurTx: ParsedTransaction[] = [
  // Netflix — same amount, same day across 3 months
  {
    date: "2024-01-15",
    description: "Netflix",
    amount: 49.9,
    category: "leisure",
    categoryLabel: "פנאי",
  },
  {
    date: "2024-02-15",
    description: "Netflix",
    amount: 49.9,
    category: "leisure",
    categoryLabel: "פנאי",
  },
  {
    date: "2024-03-15",
    description: "Netflix",
    amount: 49.9,
    category: "leisure",
    categoryLabel: "פנאי",
  },
  // Arnona — same amount, day 1
  {
    date: "2024-01-01",
    description: 'ארנונה ת"א',
    amount: 450,
    category: "housing",
    categoryLabel: "דיור",
  },
  {
    date: "2024-02-01",
    description: 'ארנונה ת"א',
    amount: 450,
    category: "housing",
    categoryLabel: "דיור",
  },
  {
    date: "2024-03-01",
    description: 'ארנונה ת"א',
    amount: 450,
    category: "housing",
    categoryLabel: "דיור",
  },
  // Random one-time
  {
    date: "2024-02-20",
    description: "איקאה",
    amount: 850,
    category: "shopping",
    categoryLabel: "קניות",
  },
];
const groups = detectRecurring(recurTx);
assert("found 2 recurring groups", groups.length, 2);
assert("Netflix recurring amount", groups.find((g) => g.description === "Netflix")?.amount, 49.9);
assert(
  "Arnona recurring amount",
  groups.find((g) => g.description.includes("ארנונה"))?.amount,
  450
);

console.log("\n═══ 10. Burn Rate Analysis ═══");
const burnTx: ParsedTransaction[] = [
  // Jan: income 15000, expenses 10000
  {
    date: "2024-01-05",
    description: "משכורת",
    amount: -15000,
    category: "salary",
    categoryLabel: "משכורת",
  },
  {
    date: "2024-01-10",
    description: "שופרסל",
    amount: 3000,
    category: "food",
    categoryLabel: "מזון",
  },
  {
    date: "2024-01-15",
    description: "ארנונה",
    amount: 2000,
    category: "housing",
    categoryLabel: "דיור",
  },
  {
    date: "2024-01-20",
    description: "חשמל",
    amount: 5000,
    category: "utilities",
    categoryLabel: "שוטפים",
  },
  // Feb: income 15000, expenses 10000
  {
    date: "2024-02-05",
    description: "משכורת",
    amount: -15000,
    category: "salary",
    categoryLabel: "משכורת",
  },
  {
    date: "2024-02-10",
    description: "שופרסל",
    amount: 3000,
    category: "food",
    categoryLabel: "מזון",
  },
  {
    date: "2024-02-15",
    description: "ארנונה",
    amount: 2000,
    category: "housing",
    categoryLabel: "דיור",
  },
  {
    date: "2024-02-20",
    description: "חשמל",
    amount: 5000,
    category: "utilities",
    categoryLabel: "שוטפים",
  },
  // Mar: income 15000, expenses 12500 (+25% spike)
  {
    date: "2024-03-05",
    description: "משכורת",
    amount: -15000,
    category: "salary",
    categoryLabel: "משכורת",
  },
  {
    date: "2024-03-10",
    description: "שופרסל",
    amount: 4000,
    category: "food",
    categoryLabel: "מזון",
  },
  {
    date: "2024-03-15",
    description: "ארנונה",
    amount: 2000,
    category: "housing",
    categoryLabel: "דיור",
  },
  {
    date: "2024-03-20",
    description: "חשמל",
    amount: 6500,
    category: "utilities",
    categoryLabel: "שוטפים",
  },
];
const burn = analyzeBurnRate(burnTx);
assert("3 months detected", burn.months.length, 3);
assert("avg saving rate > 0", burn.avgSavingRate > 0, true);
assert("alert triggered (25% spike)", burn.alert?.type, "overspend");
assert("alert severity = critical", burn.alert?.severity, "critical");

// Tier grouping
const tiers = groupByTier(burnTx);
assert("essential has food+housing+utilities", tiers.essential.total > 0, true);
assert("lifestyle is 0 (no leisure)", tiers.lifestyle.total, 0);

console.log("\n" + "═".repeat(50));
console.log(`✅ עבר: ${passed}  ❌ נכשל: ${failed}`);
if (failed > 0) process.exit(1);
