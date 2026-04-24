/**
 * ═══════════════════════════════════════════════════════════
 *  Maslaka PDF Parser — דוח ריכוז מוצרים פנסיוניים
 * ═══════════════════════════════════════════════════════════
 *
 * Parses the MAIN summary PDF from the Israeli pension clearinghouse
 * (מסלקה פנסיונית). This is the multi-page report titled
 * "דוח ריכוז מוצרים פנסיונים לחוסכ/ת".
 *
 * Key differences from annual reports (דיוור שנתי):
 *   - Contains ALL products in one file (pension, hishtalmut, insurance)
 *   - Products are in tables — sometimes multi-column (side by side)
 *   - Has a summary page with totals, then per-product detail pages
 *   - Has deposit history tables per product
 *
 * Runs server-side (uses pdf-parse / Buffer).
 */

// @ts-ignore — pdf-parse has no proper type declarations
import pdfParse from "pdf-parse";

/* ── Types ── */

export interface MaslakaPdfProduct {
  company: string;
  productType: string;       // "פנסיה חדשה מקיפה", "קרן השתלמות", etc.
  policyNumber: string;
  status: "active" | "inactive";
  balance: number;           // סה"כ חיסכון צבור
  projectedNoDeposits?: number;  // צפוי ללא הפקדות
  projectedWithDeposits?: number; // צפוי עם הפקדות
  monthlyPensionNoDeposits?: number;
  monthlyPensionWithDeposits?: number;
  mgmtFeeDeposit?: number;   // % from deposits
  mgmtFeeBalance?: number;   // % from accumulated balance
  returnYtd?: number;         // % since start of year
  lastDepositEmployee?: number;
  lastDepositEmployer?: number;
  openingDate?: string;       // YYYY-MM-DD
  liquidityDate?: string;     // YYYY-MM-DD (for hishtalmut)
  firstJoinDate?: string;     // YYYY-MM-DD
  employer?: string;
  insurancePlan?: string;     // מסלול ביטוח
  pensionSurvivorsSpouse?: number;
  pensionSurvivorsChildren?: number;
  pensionDisability?: number;
  // Insurance-only products
  deathBenefitMonthly?: number;
  deathBenefitLumpSum?: number;
  disabilityBenefitMonthly?: number;
  premium?: number;
  insuranceEndDate?: string;
}

export interface MaslakaPdfResult {
  ownerName?: string;
  ownerId?: string;
  reportDate?: string;
  products: MaslakaPdfProduct[];
  warnings: string[];
}

/* ── Helpers ── */

/** Extract ₪ amounts from text */
function extractAmounts(text: string): number[] {
  const matches = text.match(/₪\s*[\d,]+(?:\.\d{2})?/g);
  if (!matches) return [];
  return matches.map(m => {
    const cleaned = m.replace(/[₪\s,]/g, "");
    return parseFloat(cleaned) || 0;
  });
}

/** Parse a single ₪ amount */
function parseAmount(s: string): number {
  const cleaned = s.replace(/[₪\s,]/g, "");
  return parseFloat(cleaned) || 0;
}

/** Parse percentage like "1.3998000000%" → 1.4 */
function parsePct(s: string): number {
  const m = s.match(/([\d.]+)%/);
  return m ? parseFloat(m[1]) : 0;
}

/** Parse date DD/MM/YYYY or MM/YYYY → YYYY-MM-DD */
function parseDate(s: string): string {
  // DD/MM/YYYY
  const full = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (full) return `${full[3]}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
  // MM/YYYY
  const my = s.match(/(\d{1,2})\/(\d{4})/);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}-01`;
  return s;
}

/** Map product type string to normalized type */
function normalizeProductType(typeStr: string): "pension" | "hishtalmut" | "gemel" | "bituach" | "insurance_risk" | "insurance_mortgage" {
  const lower = typeStr.toLowerCase();
  if (typeStr.includes("פנסיה")) return "pension";
  if (typeStr.includes("השתלמות")) return "hishtalmut";
  if (typeStr.includes("גמל")) return "gemel";
  if (typeStr.includes("ריסק") || typeStr.includes("סיכון טהור")) return "insurance_risk";
  if (typeStr.includes("משכנתא")) return "insurance_mortgage";
  if (typeStr.includes("ביטוח")) return "bituach";
  return "gemel";
}

/* ── Section splitter ── */

interface ProductSection {
  sectionType: string;    // "קרנות פנסיה חדשות", "קרנות השתלמות", etc.
  text: string;
}

function splitIntoSections(fullText: string): ProductSection[] {
  const sections: ProductSection[] = [];

  // Known section type headers that appear in the detailed "פירוט המוצרים" area
  const sectionHeaders = [
    "קרנות פנסיה חדשות",
    "קרנות פנסיה ותיקות",
    "קרנות השתלמות",
    "קופות גמל",
    "ביטוח מנהלים",
    "חברות ביטוח – פוליסות ביטוח ריסק טהור",
    "חברות ביטוח - פוליסות ביטוח ריסק טהור",
    "חברות ביטוח - פוליסות ביטוח חיים משכנתא",
    "חברות ביטוח – פוליסות ביטוח חיים משכנתא",
    "גמל להשקעה",
  ];

  // IMPORTANT: The headers appear in both the SUMMARY section and the DETAIL section.
  // We need the ones that are followed by "שם חברה מנהלת" (detail tables).
  // Find all occurrences of each header, use the one that's followed by product details.

  for (const header of sectionHeaders) {
    let searchFrom = 0;
    let bestIdx = -1;

    while (true) {
      const idx = fullText.indexOf(header, searchFrom);
      if (idx < 0) break;

      // Check if "שם חברה מנהלת" or "סוג מוצר פנסיוני" appears within 200 chars after this header
      const after = fullText.substring(idx, idx + 300);
      if (after.includes("שם חברה מנהלת") || after.includes("סוג מוצר פנסיוני") || after.includes("מספר פוליסה")) {
        bestIdx = idx;
        break;
      }
      searchFrom = idx + header.length;
    }

    if (bestIdx < 0) continue;

    // Find the end of this section (next section header that starts on its own line)
    let endIdx = fullText.length;
    for (const otherHeader of sectionHeaders) {
      if (otherHeader === header) continue;
      let otherSearchFrom = bestIdx + header.length;
      while (true) {
        const otherIdx = fullText.indexOf(otherHeader, otherSearchFrom);
        if (otherIdx < 0 || otherIdx >= endIdx) break;
        // Only count as boundary if the header is at the START of a line (preceded by \n or is at beginning)
        // This prevents matching "אנליסט קופות גמל בעמ" as "קופות גמל" section
        const charBefore = otherIdx > 0 ? fullText[otherIdx - 1] : "\n";
        if (charBefore === "\n") {
          endIdx = otherIdx;
          break;
        }
        otherSearchFrom = otherIdx + otherHeader.length;
      }
    }
    // Also check for "פירוט הפקדות" and "פירוט התוכניות"
    for (const boundary of ["פירוט הפקדות", "פירוט התוכניות"]) {
      const bIdx = fullText.indexOf(boundary, bestIdx + header.length);
      if (bIdx > 0 && bIdx < endIdx) endIdx = bIdx;
    }

    sections.push({
      sectionType: header,
      text: fullText.substring(bestIdx, endIdx),
    });
  }

  return sections;
}

/* ── Per-section parser ── */

function parseProductSection(section: ProductSection): MaslakaPdfProduct[] {
  const { sectionType, text } = section;
  const products: MaslakaPdfProduct[] = [];

  // Extract company names — they follow "שם חברה מנהלת"
  const companyLine = text.match(/שם חברה מנהלת([\s\S]*?)סוג מוצר פנסיוני/);
  if (!companyLine) {
    // No company line found — skip section
    return products;
  }

  const companyText = companyLine[1].trim();
  // Product type line
  const typeLine = text.match(/סוג מוצר פנסיוני([\s\S]*?)מספר פוליסה/);
  const typeText = typeLine?.[1]?.trim() || "";
  // Policy numbers
  const policyLine = text.match(/מספר פוליסה([\s\S]*?)סטטוס/);
  const policyText = policyLine?.[1]?.trim() || "";
  // Status line
  const statusLine = text.match(/סטטוס([\s\S]*?)(?:\*?\s*סה["״'"]כ חיסכון|סכום ביטוח)/);
  const statusText = statusLine?.[1]?.trim() || "";

  // For multi-column tables, try to split by known patterns
  // Policy numbers are pure digits — good separator
  // In multi-column PDFs, numbers can be concatenated (e.g. "2036966042094224082")
  // We need to split them smartly: first try individual 6-12 digit matches,
  // and if a match is >12 digits, try splitting it into valid parts
  const rawMatches = policyText.match(/\d{6,}/g) || [];
  const policyNumbers: string[] = [];
  for (const raw of rawMatches) {
    if (raw.length <= 12) {
      policyNumbers.push(raw);
    } else {
      // Try splitting: Israeli policy numbers are typically 9-10 digits
      // Score each valid split by how close both parts are to typical length
      let split = false;
      let bestSplit: [string, string] | null = null;
      let bestScore = Infinity;
      const TYPICAL_LEN = 9.5; // midpoint of 9-10
      for (let splitAt = 6; splitAt <= raw.length - 6; splitAt++) {
        const left = raw.substring(0, splitAt);
        const right = raw.substring(splitAt);
        if (left.length < 6 || left.length > 12 || right.length < 6 || right.length > 12) continue;
        // Penalize if either starts with "0" (unusual for policy numbers)
        const zeroPenalty = (left.startsWith("0") ? 10 : 0) + (right.startsWith("0") ? 10 : 0);
        // Prefer both parts close to typical 9-10 digit length
        const score = Math.abs(left.length - TYPICAL_LEN) + Math.abs(right.length - TYPICAL_LEN) + zeroPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestSplit = [left, right];
        }
      }
      if (bestSplit) {
        policyNumbers.push(...bestSplit);
        split = true;
      }
      if (!split) policyNumbers.push(raw); // fallback: keep as-is
    }
  }
  const numProducts = policyNumbers.length;

  if (numProducts === 0) return products;

  // For single product, straightforward extraction
  if (numProducts === 1) {
    const product = extractSingleProduct(text, sectionType, companyText, typeText, policyNumbers[0], statusText);
    if (product) products.push(product);
  } else {
    // Multi-column: extract each product
    // Split balance amounts
    const balanceLine = text.match(/\*?\s*סה["״'"]כ חיסכון צבור([\s\S]*?)(?:חיסכון צפוי|מועד)/);
    const balanceAmounts = balanceLine ? extractAmounts(balanceLine[1]) : [];

    // Split companies — they're concatenated. Use known providers as hints.
    const companies = splitCompanyNames(companyText, numProducts);

    for (let i = 0; i < numProducts; i++) {
      const product = extractSingleProduct(
        text,
        sectionType,
        companies[i] || companyText,
        typeText,
        policyNumbers[i],
        statusText,
        i,
        numProducts,
        balanceAmounts,
      );
      if (product) products.push(product);
    }
  }

  return products;
}

function splitCompanyNames(text: string, count: number): string[] {
  // Known company keywords
  const knownCompanies = [
    "מגדל", "הפניקס", "מנורה", "הראל", "כלל", "מיטב", "אלטשולר",
    "אנליסט", "ילין", "פסגות", "מור", "אינפיניטי",
  ];

  if (count === 1) return [text];

  // Try to find company boundaries
  const found: { name: string; idx: number }[] = [];
  for (const co of knownCompanies) {
    const idx = text.indexOf(co);
    if (idx >= 0) {
      // Find the extent of this company name (until next known company or end)
      let endIdx = text.length;
      for (const other of knownCompanies) {
        if (other === co) continue;
        const otherIdx = text.indexOf(other, idx + co.length);
        if (otherIdx > 0 && otherIdx < endIdx) endIdx = otherIdx;
      }
      found.push({ name: text.substring(idx, endIdx).trim(), idx });
    }
  }

  found.sort((a, b) => a.idx - b.idx);

  if (found.length >= count) {
    return found.slice(0, count).map(f => f.name);
  }

  // Fallback: just return the full text for all
  return Array(count).fill(text);
}

function extractSingleProduct(
  sectionText: string,
  sectionType: string,
  company: string,
  productTypeText: string,
  policyNumber: string,
  statusText: string,
  colIndex = 0,
  totalCols = 1,
  preExtractedBalances?: number[],
): MaslakaPdfProduct | null {
  // Clean company name
  company = company.replace(/בע["\u05F4]?מ|בעמ/g, "").trim();

  // Determine product type
  let productType = productTypeText;
  if (sectionType.includes("השתלמות")) productType = "קרן השתלמות";
  else if (sectionType.includes("פנסיה חדשות")) productType = "פנסיה חדשה מקיפה";
  else if (sectionType.includes("ריסק")) productType = "ביטוח ריסק";
  else if (sectionType.includes("משכנתא")) productType = "ביטוח חיים משכנתא";

  // Status
  const isActive = !statusText.includes("לא פעיל") || (totalCols > 1 && colIndex === 0 && !statusText.startsWith("לא"));
  // More precise: check per-column
  let status: "active" | "inactive" = "active";
  if (totalCols === 1) {
    status = statusText.includes("לא פעיל") ? "inactive" : "active";
  } else {
    // In multi-column, statuses are concatenated: "פעיללא פעיל"
    const statusParts = statusText.split(/(פעיל|לא פעיל)/g).filter(Boolean);
    const colStatuses: string[] = [];
    for (let i = 0; i < statusParts.length; i++) {
      if (statusParts[i] === "לא פעיל") colStatuses.push("inactive");
      else if (statusParts[i] === "פעיל") colStatuses.push("active");
    }
    status = colStatuses[colIndex] === "inactive" ? "inactive" : "active";
  }

  // Balance
  let balance = 0;
  if (preExtractedBalances && preExtractedBalances[colIndex] !== undefined) {
    balance = preExtractedBalances[colIndex];
  } else {
    // Single column: find balance near this policy number
    const balMatch = sectionText.match(/סה["״'"]כ חיסכון צבור([\s\S]*?)(?:חיסכון צפוי|מועד|שיעור)/);
    if (balMatch) {
      const amounts = extractAmounts(balMatch[1]);
      balance = amounts[colIndex] || amounts[0] || 0;
    }
  }

  // Projected balances
  let projectedNoDeposits: number | undefined;
  let projectedWithDeposits: number | undefined;
  const projNoMatch = sectionText.match(/חיסכון צפוי.*ללא ה(?:פקדות|משך)([\s\S]*?)חיסכון צפוי.*עם/);
  if (projNoMatch) {
    const amounts = extractAmounts(projNoMatch[1]);
    projectedNoDeposits = amounts[colIndex] ?? amounts[0];
  }
  const projWithMatch = sectionText.match(/חיסכון צפוי.*עם המשך([\s\S]*?)(?:קיצבה|מועד|שיעור)/);
  if (projWithMatch) {
    const amounts = extractAmounts(projWithMatch[1]);
    projectedWithDeposits = amounts[colIndex] ?? amounts[0];
  }

  // Monthly pension projections
  let monthlyPensionNoDeposits: number | undefined;
  let monthlyPensionWithDeposits: number | undefined;
  const pensionNoMatch = sectionText.match(/קיצבה חודשית.*ללא ה(?:פקדות|משך)([\s\S]*?)קיצבה חודשית.*עם/);
  if (pensionNoMatch) {
    const amounts = extractAmounts(pensionNoMatch[1]);
    monthlyPensionNoDeposits = amounts[colIndex] ?? amounts[0];
  }
  const pensionWithMatch = sectionText.match(/קיצבה חודשית.*עם המשך([\s\S]*?)(?:שיעור|תשואה|הפקדה)/);
  if (pensionWithMatch) {
    const amounts = extractAmounts(pensionWithMatch[1]);
    monthlyPensionWithDeposits = amounts[colIndex] ?? amounts[0];
  }

  // Management fees
  let mgmtFeeDeposit: number | undefined;
  let mgmtFeeBalance: number | undefined;
  const feeDepositMatch = sectionText.match(/שיעור דמי ניהול מהפקדות([\s\S]*?)שיעור דמי ניהול.*מחיסכון/);
  if (feeDepositMatch) {
    const pcts = feeDepositMatch[1].match(/[\d.]+%/g);
    if (pcts && pcts[colIndex]) mgmtFeeDeposit = parsePct(pcts[colIndex]);
    else if (pcts && pcts[0]) mgmtFeeDeposit = parsePct(pcts[0]);
  }
  const feeBalMatch = sectionText.match(/שיעור דמי ניהול.*מחיסכון צבור([\s\S]*?)(?:תשואה|הפקדה|מסלול)/);
  if (feeBalMatch) {
    const pcts = feeBalMatch[1].match(/[\d.]+%/g);
    if (pcts && pcts[colIndex]) mgmtFeeBalance = parsePct(pcts[colIndex]);
    else if (pcts && pcts[0]) mgmtFeeBalance = parsePct(pcts[0]);
  }

  // Return YTD
  let returnYtd: number | undefined;
  const returnMatch = sectionText.match(/תשואה מתחילת השנה([\s\S]*?)(?:הפקדה|מסלול|תאריך)/);
  if (returnMatch) {
    const pcts = returnMatch[1].match(/-?[\d.]+%/g);
    if (pcts && pcts[colIndex]) returnYtd = parsePct(pcts[colIndex]);
    else if (pcts && pcts[0]) returnYtd = parsePct(pcts[0]);
  }

  // Last deposits
  let lastDepositEmployee: number | undefined;
  let lastDepositEmployer: number | undefined;
  const empMatch = sectionText.match(/הפקדה חודשית אחרונה - חוסך([\s\S]*?)הפקדה חודשית.*מעסיק/);
  if (empMatch) {
    const amounts = extractAmounts(empMatch[1]);
    lastDepositEmployee = amounts[colIndex] ?? amounts[0];
  }
  const employerMatch = sectionText.match(/הפקדה חודשית אחרונה - מעסיק([\s\S]*?)(?:מסלול|תאריך|קיים)/);
  if (employerMatch) {
    const amounts = extractAmounts(employerMatch[1]);
    lastDepositEmployer = amounts[colIndex] ?? amounts[0];
  }

  // Opening date
  let openingDate: string | undefined;
  const openMatch = sectionText.match(/תאריך פתיחת תכנית(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (openMatch) openingDate = parseDate(openMatch[1]);

  // First join date (for hishtalmut — this is the real opening date for liquidity calc)
  let firstJoinDate: string | undefined;
  const joinMatch = sectionText.match(/תאריך הצטרפות לראשונה(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (joinMatch) firstJoinDate = parseDate(joinMatch[1]);

  // Liquidity date (for hishtalmut)
  let liquidityDate: string | undefined;
  const liqMatch = sectionText.match(/מועד זכאות למשיכה בהטבת מס(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (liqMatch) liquidityDate = parseDate(liqMatch[1]);

  // Insurance coverage
  let insurancePlan: string | undefined;
  const insMatch = sectionText.match(/מסלול ביטוח בקרן פנסיה\n([\s\S]*?)(?:פנסיית שארים|תאריך)/);
  if (insMatch) insurancePlan = insMatch[1].trim().substring(0, 100);

  let pensionSurvivorsSpouse: number | undefined;
  let pensionSurvivorsChildren: number | undefined;
  let pensionDisability: number | undefined;
  const sSpouse = sectionText.match(/פנסיית שארים - בן\/בת זוג([\s\S]*?)פנסיית שארים - ילדים/);
  if (sSpouse) {
    const amounts = extractAmounts(sSpouse[1]);
    pensionSurvivorsSpouse = amounts[colIndex] ?? amounts[0];
  }
  const sChildren = sectionText.match(/פנסיית שארים - ילדים([\s\S]*?)פנסיית נכות/);
  if (sChildren) {
    const amounts = extractAmounts(sChildren[1]);
    pensionSurvivorsChildren = amounts[colIndex] ?? amounts[0];
  }
  const sDisability = sectionText.match(/פנסיית נכות([\s\S]*?)(?:תאריך|מסלול)/);
  if (sDisability) {
    const amounts = extractAmounts(sDisability[1]);
    pensionDisability = amounts[colIndex] ?? amounts[0];
  }

  // Insurance-only fields (for risk/mortgage products)
  let deathBenefitLumpSum: number | undefined;
  let premium: number | undefined;
  let insuranceEndDate: string | undefined;
  const deathMatch = sectionText.match(/סכום ביטוח למקרה מוות – חד פעמי([\s\S]*?)(?:סכום ביטוח אובדן|תאריך)/);
  if (deathMatch) {
    const amounts = extractAmounts(deathMatch[1]);
    deathBenefitLumpSum = amounts[0];
  }
  const premiumMatch = sectionText.match(/פרמיה\)חודשי\)\s*([\d.]+)/);
  if (premiumMatch) premium = parseFloat(premiumMatch[1]);
  const endMatch = sectionText.match(/תאריך תום הכיסוי הביטוחי(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (endMatch) insuranceEndDate = parseDate(endMatch[1]);

  return {
    company,
    productType,
    policyNumber,
    status,
    balance,
    projectedNoDeposits,
    projectedWithDeposits,
    monthlyPensionNoDeposits,
    monthlyPensionWithDeposits,
    mgmtFeeDeposit,
    mgmtFeeBalance,
    returnYtd,
    lastDepositEmployee,
    lastDepositEmployer,
    openingDate,
    liquidityDate,
    firstJoinDate,
    insurancePlan,
    pensionSurvivorsSpouse,
    pensionSurvivorsChildren,
    pensionDisability,
    deathBenefitLumpSum,
    premium,
    insuranceEndDate,
  };
}

/* ── Deposit history parser ── */

interface DepositRecord {
  policyNumber: string;
  company: string;
  productType: string;
  employer: string;
  deposits: { date: string; salary: number; employee: number; employer: number; severance: number }[];
}

function parseDepositsSection(text: string): DepositRecord[] {
  const records: DepositRecord[] = [];
  // Split by policy headers: "NNNN מספר פוליסה: | שם חברה מנהלת : XXX|סוג המוצר: YYY"
  const headerPattern = /(\d{6,12})\s*מספר פוליסה:\s*\|\s*שם חברה מנהלת\s*:\s*(.*?)\|סוג המוצר:\s*(.*?)(?:\n|$)/g;
  let match;
  const headers: { idx: number; policy: string; company: string; type: string }[] = [];

  while ((match = headerPattern.exec(text)) !== null) {
    headers.push({
      idx: match.index,
      policy: match[1],
      company: match[2].trim().replace(/בע["\u05F4]?מ|בעמ/g, "").trim(),
      type: match[3].trim(),
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const endIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length;
    const sectionText = text.substring(h.idx, endIdx);

    // Extract employer name
    const empMatch = sectionText.match(/שם המעסיק:\s*(.*?)(?:\n|$)/);
    const employer = empMatch?.[1]?.trim().replace(/בע["\u05F4]?מ|בעמ/g, "").trim() || "";

    records.push({
      policyNumber: h.policy,
      company: h.company,
      productType: h.type,
      employer,
      deposits: [],  // Could parse individual rows but not needed for now
    });
  }

  return records;
}

/* ── Main entry ── */

export async function parseMaslakaPdf(buffer: Buffer, filename: string): Promise<MaslakaPdfResult> {
  const warnings: string[] = [];
  let text = "";

  try {
    const data = await pdfParse(buffer);
    text = data.text || "";
  } catch (e) {
    warnings.push(`כשל בקריאת PDF: ${e instanceof Error ? e.message : String(e)}`);
    return { products: [], warnings };
  }

  if (!text.trim()) {
    warnings.push(`${filename}: PDF ריק`);
    return { products: [], warnings };
  }

  // Check if this is a Maslaka summary PDF
  const isMaslaka = text.includes("דוח ריכוז מוצרים פנסיונים") || text.includes("מסלקה פנסיונית");
  if (!isMaslaka) {
    warnings.push(`${filename}: לא זוהה כדוח מסלקה פנסיונית`);
    return { products: [], warnings };
  }

  // Extract owner info
  let ownerName: string | undefined;
  let ownerId: string | undefined;
  const nameMatch = text.match(/([\u0590-\u05FF]+)שם פרטי:([\u0590-\u05FF]+)שם משפחה:(\d+)מס מזהה/);
  if (nameMatch) {
    ownerName = `${nameMatch[1]} ${nameMatch[2]}`.trim();
    ownerId = nameMatch[3];
  }

  // Report date
  let reportDate: string | undefined;
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})תאריך נכונות המידע/);
  if (dateMatch) reportDate = parseDate(dateMatch[1]);

  // Split into sections and parse each
  const sections = splitIntoSections(text);
  const products: MaslakaPdfProduct[] = [];

  for (const section of sections) {
    try {
      const sectionProducts = parseProductSection(section);
      products.push(...sectionProducts);
    } catch (e) {
      warnings.push(`שגיאה בפענוח סקשן ${section.sectionType}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Enrich with employer from deposits section
  const depositsIdx = text.indexOf("פירוט הפקדות");
  if (depositsIdx > 0) {
    const depositsText = text.substring(depositsIdx);
    const depositRecords = parseDepositsSection(depositsText);
    for (const dr of depositRecords) {
      const product = products.find(p => p.policyNumber === dr.policyNumber);
      if (product && dr.employer) {
        product.employer = dr.employer;
      }
    }
  }

  if (products.length === 0) {
    warnings.push(`${filename}: לא נמצאו מוצרים בדוח`);
  }

  return { ownerName, ownerId, reportDate, products, warnings };
}

/* ── Convert to PensionFund format ── */

import type { PensionFund } from "../pension-store";

let _counter = 0;
function uid(): string {
  return `mislaka_pdf_${Date.now()}_${++_counter}`;
}

export function maslakaPdfToFunds(products: MaslakaPdfProduct[]): PensionFund[] {
  return products
    .filter(p => {
      // Skip pure insurance products (no savings balance)
      const norm = normalizeProductType(p.productType);
      if ((norm === "insurance_risk" || norm === "insurance_mortgage") && p.balance <= 0) return false;
      return true;
    })
    .map(p => {
      const norm = normalizeProductType(p.productType);
      const type: PensionFund["type"] = norm === "insurance_risk" || norm === "insurance_mortgage"
        ? "bituach" : norm as PensionFund["type"];

      const monthlyContrib = (p.lastDepositEmployee || 0) + (p.lastDepositEmployer || 0);

      return {
        id: uid(),
        company: p.company,
        type,
        balance: Math.round(p.balance),
        mgmtFeeDeposit: p.mgmtFeeDeposit || 0,
        mgmtFeeBalance: p.mgmtFeeBalance || 0,
        track: p.productType,
        monthlyContrib: Math.round(monthlyContrib),
        openingDate: p.firstJoinDate || p.openingDate,
        insuranceCover: p.pensionDisability !== undefined ? {
          death: (p.pensionSurvivorsSpouse || 0) > 0,
          disability: (p.pensionDisability || 0) > 0,
          lossOfWork: false,
        } : undefined,
      };
    });
}
