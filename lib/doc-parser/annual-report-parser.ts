/**
 * ═══════════════════════════════════════════════════════════
 *  Annual Report Parser — Pension/Gemel/Hishtalmut PDFs
 * ═══════════════════════════════════════════════════════════
 *
 * Parses the standard "דוח שנתי מפורט" (detailed annual report) PDFs
 * that every Israeli pension/gemel/hishtalmut provider sends to clients
 * once a year.
 *
 * Replaces the Maslaka XML flow:
 *   - These PDFs contain ALL the fields a financial advisor needs
 *     (balance, fees, returns, projected pension, employer, salary base,
 *      track, contributions)
 *   - Free for the client (already in their inbox)
 *   - One file per provider per year — we accept multiple at once
 *
 * Tested against:
 *   - הראל קרן השתלמות / קופת גמל
 *   - הראל פנסיה (קרן פנסיה מקיפה חדשה)
 *
 * Extensible to: מנורה, מגדל, הפניקס, מיטב, אלטשולר, אנליסט, ילין לפידות,
 * כלל ביטוח, מור גמל. Each provider follows the same regulatory schema,
 * so labels are consistent — only layout/spacing varies.
 */

// @ts-ignore — pdf-parse has no proper type declarations
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════ */
/* Types                                                         */
/* ═══════════════════════════════════════════════════════════ */

export type AnnualProductType =
  | "pension_comprehensive" // קרן פנסיה מקיפה
  | "pension_general" // קרן פנסיה כללית
  | "insurance_manager" // ביטוח מנהלים
  | "gemel" // קופת גמל
  | "hishtalmut" // קרן השתלמות
  | "gemel_investment" // גמל להשקעה
  | "unknown";

export interface AnnualPolicy {
  /** Synthetic id derived from provider + account number */
  id: string;

  /** Account / policy number on the report */
  accountNumber: string;

  /** Provider company (הראל, מגדל, מנורה, etc.) */
  providerName: string;

  /** Product type derived from report title */
  productType: AnnualProductType;
  productTypeLabel: string;

  /** Plan/track name (השתלמות כללי, גילאי 50 ומטה, ...) */
  planName: string;

  /** Customer info (one per file — usually) */
  customerName?: string;
  customerId?: string;

  /** Employment context */
  employerName?: string;
  joinDate?: string; // "12/2022" or ISO

  /** Hishtalmut/gemel liquidity date — "...משיכה חד פעמית החל מ-" (ISO) */
  liquidityDate?: string;

  /** Balance at end of report year */
  balance: number;
  reportDate: string; // "31/12/2025" or ISO

  /** Annual deposits sum (employer + employee + severance) */
  annualDeposits?: number;

  /** Last/typical monthly contribution sum (best-effort from rows) */
  monthlyContrib?: number;

  /** Mgmt fees in % */
  mgmtFeeBalance?: number; // דמי ניהול מהחיסכון המצטבר
  mgmtFeeDeposit?: number; // דמי ניהול מהפקדה שוטפת

  /** Annual returns in % */
  returnYear?: number; // שיעור התשואה ברוטו (year)
  return5y?: number; // 5-year cumulative gross return

  /** Pension projection (only relevant for pension funds) */
  projectedPensionAmount?: number; // קצבה חודשית צפויה בפרישה
  retirementAge?: number; // גיל פרישה

  /** Salary base for severance/pension calc */
  salaryBase?: number;

  status?: "active" | "inactive" | "unknown";
  annualContributionsBreakdown?: {
    employee?: number;
    employer?: number;
    severance?: number;
    total?: number;
  };
  projectedCoverages?: {
    disabilityPct?: number;
    disabilityMonthly?: number;
    disabilityContributionWaiver?: number;
    spousePct?: number;
    spouseMonthly?: number;
    childPct?: number;
    childMonthly?: number;
    parentPct?: number;
    parentMonthly?: number;
    insuranceCostPctOfDeposits?: number;
  };
  balanceMovements?: {
    openingBalance?: number;
    deposits?: number;
    transfersIn?: number;
    transfersOut?: number;
    investmentProfitLoss?: number;
    managementFeesPaid?: number;
    disabilityInsuranceCost?: number;
    survivorsInsuranceCost?: number;
    actuarialAdjustment?: number;
    closingBalance?: number;
  };
  investmentTracks?: Array<{
    name: string;
    balance?: number;
    annualReturnPct?: number;
    return5yPct?: number;
    investmentExpensePct?: number;
    mgmtFeeDepositPct?: number;
    mgmtFeeBalancePct?: number;
  }>;

  /** Free-text extra context for advisor */
  notes?: string[];
}

export interface ParsedAnnualReport {
  filename: string;
  pages: number;
  policies: AnnualPolicy[];
  warnings: string[];
}

export interface ParsedAnnualBundle {
  files: ParsedAnnualReport[];
  policies: AnnualPolicy[];
  totalBalance: number;
  totalProjectedPension: number;
  totalMonthlyContrib: number;
  byType: Record<AnnualProductType, AnnualPolicy[]>;
  warnings: string[];
  customerName?: string;
  customerId?: string;
}

/* ═══════════════════════════════════════════════════════════ */
/* Provider + product detection                                  */
/* ═══════════════════════════════════════════════════════════ */

const PROVIDER_HINTS: [string, string[]][] = [
  // More-specific brand names first so they win ties (e.g. "אלטשולר שחם").
  ["אלטשולר שחם", ["אלטשולר שחם", "אלטשולר", "altshuler"]],
  ["הראל", ["הראל", "harel"]],
  ["מגדל", ["מגדל", "מקפת", "magdal", "migdal", "makefet"]],
  ["מנורה", ["מנורה", "menora", "מבטחים"]],
  ["הפניקס", ["הפניקס", "phoenix", "fnx"]],
  ["מיטב", ["מיטב דש", "meitav"]],
  ["אנליסט", ["אנליסט", "analyst"]],
  ["ילין לפידות", ["ילין", "yelin", "lapidot"]],
  ["כלל", ["כלל ביטוח", "clal"]],
  ["מור", ["מור גמל", "מור פנסיה", "מור השקעות"]],
  ["פסגות", ["פסגות", "psagot"]],
  ["אינפיניטי", ["אינפיניטי", "infinity"]],
];

/**
 * Pick the provider whose keywords appear MOST often in the text. Counting (not
 * first-match) avoids false positives from stray mentions — e.g. an Altshuler
 * report that names "מיטבית עתודות" once in a transfer note must not be tagged
 * as מיטב when "אלטשולר שחם" appears five times.
 */
function detectProvider(text: string): string {
  const lower = text.toLowerCase();
  let best = "לא זוהה";
  let bestCount = 0;
  for (const [name, kws] of PROVIDER_HINTS) {
    let count = 0;
    for (const k of kws) {
      const needle = k.toLowerCase();
      let idx = lower.indexOf(needle);
      while (idx !== -1) {
        count++;
        idx = lower.indexOf(needle, idx + needle.length);
      }
    }
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

const PRODUCT_HINTS: [AnnualProductType, string, string[]][] = [
  ["pension_comprehensive", "קרן פנסיה מקיפה", ["קרן פנסיה מקיפה חדשה", "פנסיה מקיפה"]],
  ["pension_general", "קרן פנסיה כללית", ["קרן פנסיה כללית", "פנסיה כללית"]],
  ["pension_comprehensive", "קרן פנסיה", ["דוח שנתי מפורט בקרן פנסיה", "קרן פנסיה חדשה"]],
  ["insurance_manager", "ביטוח מנהלים", ["ביטוח מנהלים"]],
  ["hishtalmut", "קרן השתלמות", ["קרן השתלמות", "בקרן השתלמות"]],
  ["gemel_investment", "גמל להשקעה", ["גמל להשקעה"]],
  ["gemel", "קופת גמל", ["קופת גמל", "בקופת גמל"]],
];

function detectProduct(text: string): { type: AnnualProductType; label: string } {
  if (/סוג\s*הקרן\s*כללית/.test(text) || text.includes("מקפת משלימה")) {
    return { type: "pension_general", label: "קרן פנסיה כללית" };
  }
  for (const [type, label, kws] of PRODUCT_HINTS) {
    if (kws.some((k) => text.includes(k))) return { type, label };
  }
  return { type: "unknown", label: "לא ידוע" };
}

/* ═══════════════════════════════════════════════════════════ */
/* Number + date helpers                                         */
/* ═══════════════════════════════════════════════════════════ */

/** Parse Israeli currency-formatted number: "117,064.70" → 117064.70 */
function parseAmount(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s)
    .replace(/[₪$\s\u200E\u200F]/g, "")
    .replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The PDF text flow often glues two adjacent numeric cells together with no
 * separator (e.g. "47,231.5247,231.52" — value column + sum column). When we
 * anchor a regex on a label, the captured digit blob may contain TWO numbers.
 * This helper extracts all valid Israeli-format numbers from a blob and
 * returns the last one (which is the one closest to the label in text flow).
 */
function lastNumberInBlob(blob: string): number | undefined {
  const all = blob.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  if (!all || !all.length) return undefined;
  return parseAmount(all[all.length - 1]);
}

function firstNumberInBlob(blob: string): number | undefined {
  const all = blob.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  if (!all || !all.length) return undefined;
  return parseAmount(all[0]);
}

function numbersInBlob(blob: string): number[] {
  const all = blob.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  return all ? all.map(parseAmount) : [];
}

function cleanHebrewPdfText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/[\u200E\u200F]/g, "")
    .replace(/\s+/g, " ")
    // PDF RTL extraction can flip parentheses to ")phrase(" \u2014 restore them to
    // "(phrase)". Allow spaces inside so multi-word phrases are caught too
    // (e.g. ")\u05DC\u05DE\u05E2\u05D8 \u05D2\u05D1\u05E8 \u05D4\u05DE\u05E6\u05D8\u05E8\u05E3 \u05DE\u05D2\u05D9\u05DC 41(").
    .replace(/\)\s*([^()]+?)\s*\(/g, "($1)")
    .replace(/(\d{4}\))(?=[\u0590-\u05FF])/g, "$1 ")
    .trim();
}

/** Parse percentage: "0.40%" → 0.40 */
function parsePct(s: string | undefined | null): number {
  if (!s) return 0;
  const m = String(s).match(/([\d.]+)\s*%/);
  return m ? parseFloat(m[1]) : 0;
}

/** Parse Israeli date "31/12/2025" → ISO "2025-12-31"; passthrough if not matched */
function parseDate(s: string | undefined | null): string {
  if (!s) return "";
  const m = String(s).match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (!m) return String(s).trim();
  const [, d, mo, y] = m;
  const yr = y.length === 2 ? `20${y}` : y;
  return `${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Find the first match of any regex in a list and return its first capture group.
 */
function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

/* ═══════════════════════════════════════════════════════════ */
/* Field extractors — work on the FULL pdf text (not per-line)   */
/* ═══════════════════════════════════════════════════════════ */

function extractCustomer(text: string): { name?: string; id?: string } {
  // PDF text flow glues labels: "313570939מספר תעודת זהותגל פישרשם העמית/ה"
  // Order in raw text:  ID, "מספר תעודת זהות", NAME, "שם העמית"
  // → name appears BETWEEN "מספר תעודת זהות" and "שם העמית"
  const idMatch =
    text.match(/(\d{9})\s*מספר\s*תעודת\s*זהות/) ||
    text.match(/מספר\s*תעודת\s*זהות\s*\n?\s*(\d{9})/);
  const id = idMatch?.[1];

  // Look for name strictly between the two labels
  const nameSlice =
    text.match(/מספר\s*תעודת\s*זהות([\u0590-\u05FF\s'"-]{1,40}?)שם\s*העמית/) ||
    text.match(/שם\s*העמית(?:\/ה)?([\u0590-\u05FF\s'"-]{1,40}?)מספר\s*תעודת\s*זהות/);
  const name = nameSlice?.[1]
    ?.replace(/[\u200E\u200F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { name, id };
}

/** Try several regex patterns to pull the headline balance. */
function extractBalance(text: string, _reportDate: string): number {
  // PDF flow often glues two cells together: "47,231.5247,231.52סה"כ בש"ח".
  // We capture the whole digit blob preceding the label, then pick the LAST
  // valid number — that's the value closest to the label.

  // Pattern 1: "<BLOB>סה"כ בש"ח" — Harel hishtalmut grand total at top of file
  const grandTotalMatch = text.match(/([\d,.]+)\s*סה[״"']כ\s*בש[״"']ח/);
  if (grandTotalMatch) {
    const v = lastNumberInBlob(grandTotalMatch[1]);
    if (v !== undefined) return v;
  }

  // Pattern 2: "<BLOB>31/12/YYYYיתרת החיסכון המצטבר ל-"
  // Appears twice: opening (year start) and closing (year end). Use last.
  const breakdownMatches = [
    ...text.matchAll(/([\d,.]+)\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*יתרת\s*החיסכון\s*המצטבר/g),
  ];
  if (breakdownMatches.length) {
    // The breakdown row visual order (RTL) puts TOTAL first then components,
    // so in extracted text the total is the FIRST number on the line.
    const lastMatch = breakdownMatches[breakdownMatches.length - 1];
    const v = firstNumberInBlob(lastMatch[1]);
    if (v !== undefined) return v;
  }

  // Migdal/Makafet layout: label first, date, then component columns and total.
  const labelFirstMatches = [
    ...text.matchAll(
      /יתרת\s*החיסכון\s*המצטבר\s*ל-\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*([\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2})/g
    ),
    ...text.matchAll(
      /יתרת\s*חיסכון\s*מצטבר\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*([\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2})/g
    ),
  ];
  if (labelFirstMatches.length) {
    const nums = numbersInBlob(labelFirstMatches[labelFirstMatches.length - 1][1]);
    if (nums.length) return nums[nums.length - 1];
  }

  // Harel pension layout: total/component columns appear before date + label.
  const reverseRows = [
    ...text.matchAll(
      /((?:-?\d{1,3}(?:,\d{3})*\.\d{2}\s*){3,4})\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*[-–]?\s*יתרת\s*החיסכון\s*המצטבר/g
    ),
  ];
  if (reverseRows.length) {
    const nums = numbersInBlob(reverseRows[reverseRows.length - 1][1]);
    if (nums.length) return nums[0];
  }

  // Pattern 3: alternative phrasings
  const altPatterns = [
    /([\d,.]+)\s*יתרת\s*הכספים\s*בקופה\s*בסוף\s*השנה/,
    /([\d,.]+)\s*יתרת\s*חיסכון\s*בסוף/,
    /יתרת\s*כספי\s*חסכון[\s:]*([\d,.]+)/,
  ];
  for (const rx of altPatterns) {
    const m = text.match(rx);
    if (m) {
      const v = lastNumberInBlob(m[1]);
      if (v !== undefined) return v;
    }
  }
  return 0;
}

function extractReportDate(text: string): string {
  // PDF flow has the date BEFORE the label: "31/12/2025תאריך הדוח: "
  const m = text.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*תאריך\s*הדוח/);
  if (m) return parseDate(m[1]);
  // Forward variant — some providers may put it after
  const m2 = text.match(/תאריך\s*הדוח[:\s]*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/);
  if (m2) return parseDate(m2[1]);
  // Fallback: report period
  const m3 = text.match(
    /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*-\s*\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/
  );
  if (m3) return parseDate(m3[1]);
  return "";
}

function extractAccountNumber(text: string): string | undefined {
  // "163173991מספר חשבון העמית/ה" or "מספר חשבון העמית/ה163173991"
  const patterns = [
    /(\d{6,12})\s*מספר\s*חשבון\s*העמית/,
    /מספר\s*חשבון\s*העמית[\s\/ה]*(\d{6,12})/,
    /(\d{6,12})\s*מספר\s*פוליסה/,
    /מספר\s*פוליסה[\s:]*(\d{6,12})/,
  ];
  return firstMatch(text, patterns);
}

function extractEmployer(text: string): string | undefined {
  // Value sits BEFORE the label in PDF text flow:
  //   "...מס הכנסה\nסומך חייקיןשם המעסיק האחרון"
  // CRITICAL: must NOT cross newlines, otherwise the regex spans the previous
  // label "ותק הכספים לעניין מס הכנסה" too.
  // Allow a single space inside the name (e.g. "סומך חייקין").
  const m =
    text.match(/\n([\u0590-\u05FF][\u0590-\u05FF '"-]{1,30}?)\s*שם\s*המעסיק\s*האחרון/) ||
    text.match(/שם\s*המעסיק\s*האחרון\s*([\u0590-\u05FF0-9\s'"().-]{2,50}?)(?:מועד|תקופת|מסמכים|\n)/);
  if (!m) return undefined;
  const candidate = cleanHebrewPdfText(m[1]) || "";
  // Reject obvious junk labels
  if (/ותק|מעמד|מצב|תקופ|מסלול|מספר|מועד|כתובת|לעניין|לפי/.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function extractLiquidityDate(text: string): string | undefined {
  // "יתרת הכספים המיועדים למשיכה חד פעמית החל מ-  31/01/2031"
  const m = text.match(/למשיכה\s*חד\s*פעמית\s*החל\s*מ-?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/);
  return m ? parseDate(m[1]) : undefined;
}

function extractJoinDate(text: string): string | undefined {
  // "12/2022מועד הצטרפות העמית/ה לקרן ההשתלמות" or pension variant
  const m =
    text.match(/(\d{1,2}[\/\.\-]\d{2,4})\s*מועד\s*הצטרפות/) ||
    text.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*מועד\s*תחילת\s*חישוב\s*ותק/);
  return m ? m[1] : undefined;
}

function extractPlanName(text: string): string | undefined {
  // Track row: "<TRACK>מסלול ההשקעה בו מנוהלים כספי החיסכון"
  const m =
    text.match(/מסלול\s*ההשקעה\s*בו\s*מנוהלים\s*כספי\s*החיסכון\s*הצבור([\s\S]{2,120}?)מסלול\s*ביטוח/) ||
    text.match(/שם\s*מסלול\s*השקעה[\s\S]{0,100}?([\u0590-\u05FF][\u0590-\u05FF\s\-']{2,40})/) ||
    text.match(/([\u0590-\u05FF][\u0590-\u05FF\s\-']{2,40}?)\s*מסלול\s*ההשקעה\s*בו\s*מנוהלים/);
  return cleanHebrewPdfText(m?.[1]);
}

function extractMgmtFees(text: string): { balance?: number; deposit?: number } {
  // PDF row format example (Harel pension):
  //   "0.13%0.50%31/12/20280.14%0.14%129.04דמי ניהול מהחיסכון המצטבר"
  // Order in text: avg-of-industry, max-without-discount, end-of-discount, current, current(repeat), sum-shekels, LABEL
  // We want the CURRENT rate — that's the percentage closest to the label
  // (last percentage immediately before the shekels amount and label).
  const balRow = text.match(/([\d.]+)%\s*[\d.,]+\s*דמי\s*ניהול\s*מהחיסכון\s*המצטבר/);
  const depRow = text.match(/([\d.]+)%\s*[\d.,]+\s*דמי\s*ניהול\s*מהפקדה\s*שוטפת/);
  const balDiscount = text.match(
    /דמי\s*ניהול\s*מהחיסכון\s*המצטבר\s*([\d.]+)%\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/
  );
  const depDiscount = text.match(
    /דמי\s*ניהול\s*מהפקדה\s*שוטפת\s*([\d.]+)%\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/
  );
  const balForward = text.match(/שיעור\s*דמי\s*ניהול\s*מחיסכון\s*([\d.]+)%/);
  const depForward = text.match(/שיעור\s*דמי\s*ניהול\s*מהפקדה\s*([\d.]+)%/);
  return {
    balance: balDiscount
      ? parseFloat(balDiscount[1])
      : balRow
        ? parseFloat(balRow[1])
        : balForward
          ? parseFloat(balForward[1])
          : undefined,
    deposit: depDiscount
      ? parseFloat(depDiscount[1])
      : depRow
        ? parseFloat(depRow[1])
        : depForward
          ? parseFloat(depForward[1])
          : undefined,
  };
}

function extractReturns(text: string): { year?: number; fiveY?: number } {
  // The returns table row has 4 percentages followed by a track name, but the
  // column order varies by provider/product:
  //   - Hishtalmut: cost / 5Y / 1Y / index
  //   - Pension:    5Y / cost / 1Y / index
  // Heuristic: the LARGEST % is the 5Y cumulative, the next-largest is 1Y,
  // and the smallest two are cost and index inflation (~0.5-3%).
  const idx = text.indexOf("תשואה שהושגה");
  const searchText = idx >= 0 ? text.slice(idx, idx + 1500) : text;
  const tableMatch = searchText.match(
    /([\d.]+)%\s*([\d.]+)%\s*([\d.]+)%\s*([\d.]+)%[\u0590-\u05FF\s\-'"]{2,40}?(?:כללי|מנייתי|אג["\u05F4]ח|כספי|s&p|מסלול|גילאי|השתלמות|מקיפה)/i
  );
  if (!tableMatch) return {};
  const nums = [1, 2, 3, 4].map((i) => parseFloat(tableMatch[i])).sort((a, b) => b - a);
  // Largest = 5Y; second largest = 1Y (only when meaningfully larger than the cost ~0.5%)
  const fiveY = nums[0];
  const yr = nums[1] > 3 ? nums[1] : undefined;
  return { year: yr, fiveY };
}

function extractProjectedPension(text: string): { amount?: number; retireAge?: number } {
  // "2,272.72קצבה חודשית צפויה בפרישה לעמית/ה בגיל  67"
  const m = text.match(/([\d,]+\.\d{2})\s*קצבה\s*חודשית\s*צפויה\s*בפרישה[\s\S]{0,40}?(\d{2})/);
  if (m) return { amount: parseAmount(m[1]), retireAge: parseInt(m[2], 10) };
  const forward = text.match(
    /קצבה\s*חודשית\s*צפויה\s*בפרישה[\s\S]{0,40}?גיל\s*(\d{2})[\s\S]{0,20}?([\d,]+\.\d{2})/
  );
  if (forward) return { amount: parseAmount(forward[2]), retireAge: parseInt(forward[1], 10) };
  // Alt: just the amount
  const m2 = text.match(/([\d,]+\.\d{2})\s*קצבה\s*חודשית\s*צפויה\s*בפרישה/);
  if (m2) return { amount: parseAmount(m2[1]) };
  return {};
}

function extractSalaryBase(text: string): number | undefined {
  // "17,443.96משכורת קובעת לנכות ושאירים" or "סבסיס משכורת על שהופקדו"
  const forward = text.match(/משכורת\s*קובעת\s*לנכות\s*ושאירים\s*([\d,]+\.\d{2})/);
  if (forward) return parseAmount(forward[1]);
  const m = text.match(/([\d,]+\.\d{2})\s*משכורת\s*קובעת/);
  if (m) return parseAmount(m[1]);
  return undefined;
}

function numberAfterLabel(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`${escaped}[^\\d\\n]{0,20}([\\d,]+\\.\\d{2})`));
  return m ? parseAmount(m[1]) : undefined;
}

function pctAfterLabel(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`${escaped}\\s*([\\d.]+)%`));
  return m ? parseFloat(m[1]) : undefined;
}

function extractStatus(text: string): "active" | "inactive" | "unknown" {
  const m =
    text.match(/סוג\s*עמית(?:\/ה)?\s*([\u0590-\u05FF/]+)(?:מסלול|גיל|שם|מועד|\n)/) ||
    text.match(/([\u0590-\u05FF/]+)\s*סוג\s*העמית/);
  const value = m?.[1] || "";
  if (value.includes("לא פעיל")) return "inactive";
  if (value.includes("פעיל")) return "active";
  return "unknown";
}

function extractAnnualContributionsBreakdown(text: string): AnnualPolicy["annualContributionsBreakdown"] {
  const idx = text.indexOf("פירוט הפקדות");
  if (idx < 0) return undefined;
  const sub = text.slice(idx, idx + 4000);
  const spacedTotal = sub.match(/סה[״"']כ\s*((?:[\d,]+\.\d{2}-?\s*){4})/);
  if (spacedTotal) {
    const nums = numbersInBlob(spacedTotal[1]);
    if (nums.length < 4) return undefined;
    return {
      employee: nums[0],
      employer: nums[1],
      severance: nums[2],
      total: nums[3],
    };
  }
  const reverseTotal = sub.match(/סה[״"']כ\s*\n?((?:[\d,]+\.\d{2}){4})/);
  if (reverseTotal) {
    const nums = numbersInBlob(reverseTotal[1]);
    if (nums.length >= 4) {
      return { total: nums[0], severance: nums[1], employer: nums[2], employee: nums[3] };
    }
  }
  return undefined;
}

function extractProjectedCoverages(text: string): AnnualPolicy["projectedCoverages"] {
  const coverages = {
    disabilityPct: pctAfterLabel(text, "שיעור קצבת נכות ממשכורת קובעת"),
    disabilityMonthly: numberAfterLabel(text, "קצבה חודשית במקרה של נכות מלאה"),
    disabilityContributionWaiver: numberAfterLabel(text, "שחרור מתשלום הפקדות לקרן במקרה של נכות"),
    spousePct: pctAfterLabel(text, "שיעור קצבה לאלמן/ה ממשכורת קובעת במקרה מוות"),
    spouseMonthly: numberAfterLabel(text, "קצבה חודשית לאלמן/ת העמית במקרה מוות"),
    childPct: pctAfterLabel(text, "שיעור קצבה ליתום ממשכורת קובעת במקרה מוות"),
    childMonthly: numberAfterLabel(text, "קצבה חודשית ליתום במקרה מוות"),
    parentPct: pctAfterLabel(text, "שיעור קצבה להורה נתמך ממשכורת קובעת במקרה מוות"),
    parentMonthly: numberAfterLabel(text, "קצבה חודשית להורה נתמך במקרה מוות"),
    insuranceCostPctOfDeposits: pctAfterLabel(
      text,
      "אחוז מסך כל ההפקדות ששולם בשנת הדוח עבור רכישת כיסוי ביטוחי"
    ),
  };
  return Object.values(coverages).some((v) => typeof v === "number") ? coverages : undefined;
}

function extractBalanceMovements(text: string): AnnualPolicy["balanceMovements"] {
  const movements: AnnualPolicy["balanceMovements"] = {
    openingBalance: undefined,
    deposits: extractAnnualDeposits(text),
    transfersIn: undefined,
    transfersOut: undefined,
    investmentProfitLoss: undefined,
    managementFeesPaid: undefined,
    disabilityInsuranceCost: undefined,
    survivorsInsuranceCost: undefined,
    actuarialAdjustment: undefined,
    closingBalance: undefined,
  };

  const valueOnLabelLine = (label: string, side: "before" | "after" = "before") => {
    const idx = text.indexOf(label);
    if (idx < 0) return undefined;
    const lineStart = text.lastIndexOf("\n", idx);
    const lineEnd = text.indexOf("\n", idx);
    const line = text.slice(lineStart >= 0 ? lineStart + 1 : 0, lineEnd >= 0 ? lineEnd : text.length);
    const part = side === "after" ? line.slice(line.indexOf(label) + label.length) : line.slice(0, line.indexOf(label));
    const nums = numbersInBlob(part);
    if (!nums.length) return undefined;
    return side === "after" ? nums[nums.length - 1] : nums[0];
  };

  movements.transfersIn = valueOnLabelLine("כספים שהעברת לחשבון", "after");
  movements.transfersOut = valueOnLabelLine("כספים שהעברת מהקרן");
  movements.investmentProfitLoss =
    valueOnLabelLine("רווחים בניכוי הוצאות ניהול השקעות", "after") ??
    valueOnLabelLine("רווחים בניכוי הוצאות ניהול השקעות");
  movements.managementFeesPaid =
    valueOnLabelLine("דמי ניהול שנגבו בשנה זו", "after") ?? valueOnLabelLine("דמי ניהול שנגבו בשנה זו");
  movements.disabilityInsuranceCost =
    valueOnLabelLine("עלות הביטוח לסיכוני נכות", "after") ?? valueOnLabelLine("עלות הביטוח לסיכוני נכות");
  movements.survivorsInsuranceCost =
    valueOnLabelLine("עלות הביטוח לשארים", "after") ?? valueOnLabelLine("עלות הביטוח לשארים");
  movements.actuarialAdjustment =
    valueOnLabelLine("עדכון יתרת הכספים בגין הפעלת מנגנון איזון אקטוארי", "after") ??
    valueOnLabelLine("עדכון יתרת הכספים בגין הפעלת מנגנון איזון אקטוארי");
  movements.closingBalance = extractBalance(text, "");

  return Object.values(movements).some((v) => typeof v === "number") ? movements : undefined;
}

function extractInvestmentTracks(text: string, fallbackTrack: string | undefined): AnnualPolicy["investmentTracks"] {
  const tracks: NonNullable<AnnualPolicy["investmentTracks"]> = [];
  const balanceRow = text.match(/יתרת\s*חיסכון\s*מצטבר\s*31\.12\.25\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
  const returnRow = text.match(/שיעור\s*התשואה\s*ברוטו\*?\s*([\d.]+)%\s*([\d.]+)%/);
  const return5yRow = text.match(/שיעור\s*תשואה\s*מצטבר\s*ברוטו\s*בתקופה\s*של\s*5\s*שנים\s*([\d.]+)%\s*([\d.]+)%/);
  const feeDepositRow = text.match(/שיעור\s*דמי\s*ניהול\s*מהפקדה\s*([\d.]+)%\s*([\d.]+)%/);
  const feeBalanceRow = text.match(/שיעור\s*דמי\s*ניהול\s*מחיסכון\s*([\d.]+)%\s*([\d.]+)%/);
  const expenseRow = text.match(/שיעור\s*הוצאות\s*לניהול\s*השקעות\*?\s*([\d.]+)%\s*([\d.]+)%/);

  if (balanceRow) {
    tracks.push({
      name: "לבני 50 ומטה - תלוי גיל",
      balance: parseAmount(balanceRow[1]),
      annualReturnPct: returnRow ? parseFloat(returnRow[1]) : undefined,
      return5yPct: return5yRow ? parseFloat(return5yRow[1]) : undefined,
      mgmtFeeDepositPct: feeDepositRow ? parseFloat(feeDepositRow[1]) : undefined,
      mgmtFeeBalancePct: feeBalanceRow ? parseFloat(feeBalanceRow[1]) : undefined,
      investmentExpensePct: expenseRow ? parseFloat(expenseRow[1]) : undefined,
    });
    tracks.push({
      name: "עוקב מדד S&P500",
      balance: parseAmount(balanceRow[2]),
      annualReturnPct: returnRow ? parseFloat(returnRow[2]) : undefined,
      return5yPct: return5yRow ? parseFloat(return5yRow[2]) : undefined,
      mgmtFeeDepositPct: feeDepositRow ? parseFloat(feeDepositRow[2]) : undefined,
      mgmtFeeBalancePct: feeBalanceRow ? parseFloat(feeBalanceRow[2]) : undefined,
      investmentExpensePct: expenseRow ? parseFloat(expenseRow[2]) : undefined,
    });
  }

  if (!tracks.length && fallbackTrack) {
    tracks.push({ name: fallbackTrack });
  }
  return tracks.length ? tracks : undefined;
}

function extractAnnualDeposits(text: string): number | undefined {
  // Two possible signals:
  //
  // 1. The contributions table "סה"כ" row (best, when present):
  //    "36,907.5011,970.0012,967.5011,970.00סה"כ" — first num is the grand total
  //
  // 2. The annual flow row in the balance breakdown:
  //    "<TOTAL><BREAKDOWN>הפקדות כספים לקרן/לחשבון"
  const idx = text.indexOf("פירוט הפקדות");
  if (idx >= 0) {
    const sub = text.slice(idx, idx + 4000);
    // The "סה"כ" line in the contributions table — total is the LARGEST of the
    // 4 numbers (employee + employer + severance + total), grabbed sequentially.
    const totalRow = sub.match(
      /([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*סה[״"']כ/
    );
    if (totalRow) {
      const nums = [1, 2, 3, 4].map((i) => parseAmount(totalRow[i]));
      return Math.max(...nums);
    }
  }
  // Fallback: the balance breakdown row
  const flowForward = text.match(
    /הפקדות\s*כספים\s*ל(?:קרן|חשבון)\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/
  );
  if (flowForward) return parseAmount(flowForward[4]);
  const flow = text.match(/((?:-?\d{1,3}(?:,\d{3})*\.\d{2}){4})\s*הפקדות\s*כספים\s*ל(?:קרן|חשבון)/);
  if (flow) {
    const nums = numbersInBlob(flow[1]);
    if (nums.length) return nums[0];
  }
  return undefined;
}

/* ═══════════════════════════════════════════════════════════ */
/* Summary report format (short annual + quarterly)              */
/* ═══════════════════════════════════════════════════════════ */
/*
 * Several providers send a short summary report (NOT the "דוח שנתי מפורט"):
 *   - Harel:     "דוח שנתי/רבעוני בקרן השתלמות / בקופת גמל"
 *   - Altshuler: "דוח שנתי/רבעוני לעמית ב... אלטשולר שחם ..."
 * Shared regulatory template:
 *   - Section "ב. תנועות בחשבונך / בקרן הפנסיה" with opening/deposits/PnL/fees
 *   - Section "א. תשלומים צפויים" (liquidity date for hishtalmut/gemel)
 *   - Section "ד. מסלולי השקעה ותשואות" (track name + return)
 *   - Amounts rounded to whole shekels (no .XX decimals)
 * Label positions differ per provider (value-before-label vs label-before-value)
 * so the extractors below try both orderings.
 */

function isSummaryFormat(text: string): boolean {
  // The detailed report has "תנועות ויתרות כספים" + "יתרת החיסכון המצטבר" — not us.
  const isDetailed = /תנועות\s*ויתרות\s*כספים/.test(text) || /יתרת\s*החיסכון\s*המצטבר/.test(text);
  if (isDetailed) return false;
  const hasMovements = /תנועות\s*ב(?:חשבונך|קרן)/.test(text);
  const hasClosing = /יתרת\s*הכספים\s*ב(?:חשבון|קרן)\s*(?:בסוף|נכון\s*ל)/.test(text);
  return hasMovements && hasClosing;
}

/** Parse an integer-or-decimal Israeli amount that sits BEFORE a label. */
function amountBeforeLabel(text: string, labelSource: string): number | undefined {
  const m = text.match(new RegExp(`(-?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)\\s*${labelSource}`));
  return m ? parseAmount(m[1]) : undefined;
}

/** First amount among several candidate labels (value-before-label). */
function amountBeforeAny(text: string, labels: string[]): number | undefined {
  for (const l of labels) {
    const v = amountBeforeLabel(text, l);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Parse ONE product block of a summary report into a policy. A single PDF may
 * bundle several products (Altshuler quarterly stacks gemel + hishtalmut), so
 * provider + report date are resolved once at the file level and passed in.
 */
function parseSummaryBlock(
  text: string,
  providerName: string,
  reportDate: string,
  isQuarterly: boolean,
  source: "pdf" | "spreadsheet" | "text"
): AnnualPolicy | null {
  const product = detectProduct(text);

  // ── Customer + account — labels may sit before OR after the value ──
  // Harel: "311505036מספר ת.ז.:  איתי קרקסוןשם:" / "172280186 מספר חשבון:"
  // Altshuler: "שם העמית: איתי קרקסון   מספר ת.ז.: 31150503/6   מספר חשבון: 40572870"
  const customerId =
    text.match(/מספר\s*ת\.?ז\.?\s*:?\s*(\d{8,9})(?:\/\d)?/)?.[1] ||
    text.match(/(\d{9})\s*מספר\s*ת\.?ז/)?.[1] ||
    text.match(/מספר\s*תעודת\s*זהות\s*:?\s*(\d{9})/)?.[1];

  const customerName = cleanHebrewPdfText(
    text.match(/שם\s*העמית(?:\/ה)?\s*:?\s*([֐-׿][֐-׿\s'"-]{1,40}?)\s{2,}/)?.[1] ||
      text.match(/מספר\s*ת\.?ז\.?\s*:?\s*[֐-׿\s'"-]{0,40}?([֐-׿][֐-׿\s'"-]{2,40}?)\s*שם\s*:/)?.[1]
  );

  // Account number: try value-BEFORE-label first (Harel: "172280186 מספר חשבון")
  // then value-AFTER-label (Altshuler: "מספר חשבון: 40572870"). The before-first
  // order matters — in Harel the number AFTER "מספר חשבון:" is actually the ת.ז.
  let accountNumber =
    text.match(/(\d{6,12})\s*מספר\s*חשבון/)?.[1] ||
    text.match(/מספר\s*חשבון\s*(?:העמית\/?ה?)?\s*:?\s*(\d{6,12})/)?.[1] ||
    "";
  // Guard: never accept a number that is actually the ת.ז or the deductions-file
  // number ("מספר תיק ניכויים") glued right after "מספר חשבון:".
  if (
    accountNumber &&
    (accountNumber === customerId ||
      new RegExp(`${accountNumber}\\s*מספר\\s*(?:תיק|ת\\.?ז)`).test(text))
  ) {
    accountNumber = "";
  }

  // ── Balance + movements (labels: חשבון|קרן, בסוף|נכון ל) ──
  const balance =
    amountBeforeAny(text, [
      "יתרת\\s*הכספים\\s*ב(?:חשבון|קרן)\\s*בסוף",
      "יתרת\\s*הכספים\\s*ב(?:חשבון|קרן)\\s*נכון\\s*ל",
    ]) ?? 0;
  const openingBalance = amountBeforeLabel(
    text,
    "יתרת\\s*הכספים\\s*ב(?:חשבון|קרן)\\s*בתחילת\\s*השנה"
  );
  const deposits = amountBeforeLabel(text, "כספים\\s*שהופקדו\\s*ל(?:חשבון|קרן)");
  const profitLoss = amountBeforeAny(text, [
    "רווחים\\s*בניכוי\\s*הוצאות\\s*ניהול\\s*השקעות",
    "הפסדים\\s*בניכוי\\s*הוצאות\\s*ניהול\\s*השקעות",
  ]);
  const feesPaid = amountBeforeLabel(text, "דמי\\s*ניהול\\s*שנגבו\\s*בשנה\\s*זו");
  const transfersOut = amountBeforeLabel(text, "כספים\\s*שהעברת\\s*מהקרן");

  // Mgmt fees: "0.20%דמי ניהול מחיסכון" / "1.49%דמי ניהול מהפקדה" (value before label)
  const mgmtFeeBalance = (() => {
    const m = text.match(/([\d.]+)\s*%\s*דמי\s*ניהול\s*מחיסכון/);
    return m ? parseFloat(m[1]) : undefined;
  })();
  const mgmtFeeDeposit = (() => {
    const m = text.match(/([\d.]+)\s*%\s*דמי\s*ניהול\s*מהפקדה/);
    return m ? parseFloat(m[1]) : undefined;
  })();

  // Investment track + return: "ד. מסלולי השקעה ... 6.31%עוקב מדדי מניות".
  // Quarterly Harel may show two %s ("1.01%-6.43%...") — take the last as return.
  let planName: string | undefined;
  let returnYear: number | undefined;
  const trackM = text.match(
    /ד\.\s*מסלולי\s*השקעה[\s\S]{0,120}?((?:-?[\d.]+\s*%\s*)+)([֐-׿][֐-׿\s'"\-]{2,40})/
  );
  if (trackM) {
    const pcts = trackM[1].match(/-?[\d.]+/g)?.map((n) => parseFloat(n)) ?? [];
    returnYear = pcts.length ? pcts[pcts.length - 1] : undefined;
    planName = cleanHebrewPdfText(trackM[2]);
  }

  const annualDeposits = deposits;
  const periodMonths = isQuarterly ? 3 : 12;
  const monthlyContrib = annualDeposits
    ? +(annualDeposits / periodMonths).toFixed(2)
    : undefined;

  const balanceMovements: AnnualPolicy["balanceMovements"] = {
    openingBalance,
    deposits,
    investmentProfitLoss: profitLoss,
    transfersOut: transfersOut !== undefined ? Math.abs(transfersOut) : undefined,
    managementFeesPaid: feesPaid !== undefined ? Math.abs(feesPaid) : undefined,
    closingBalance: balance || undefined,
  };
  const hasMovements = Object.values(balanceMovements).some((v) => typeof v === "number");

  // A block with neither an account nor any balance/movement is noise (e.g. a
  // cover page sliced off) — skip it.
  if (!accountNumber && !balance && !hasMovements) return null;

  const periodWord = isQuarterly ? "רבעוני" : "שנתי";
  const notes: string[] = [
    `דוח ${periodWord} מתומצת (${providerName}) — הנתונים מעוגלים לשקל${
      isQuarterly ? "; הפקדה חודשית חושבה לפי הרבעון" : ""
    }`,
  ];
  if (source !== "pdf") notes.push("חולץ מקובץ טבלאי/טקסטואלי — מומלץ לאמת מול מסמך המקור");

  // Stable key for dedup/merge: prefer the account number; when the report
  // omits it (e.g. Altshuler pension quarterly), fall back to customerId+type so
  // q1/q2 of the same fund still merge instead of spawning duplicates.
  const stableKey =
    accountNumber ||
    (customerId ? `${customerId}_${product.type}` : Math.random().toString(36).slice(2, 8));

  return {
    id: `pdf_${providerName}_${stableKey}`,
    accountNumber,
    providerName,
    productType: product.type,
    productTypeLabel: product.label,
    planName: planName || product.label,
    customerName,
    customerId,
    liquidityDate: extractLiquidityDate(text),
    balance,
    reportDate,
    annualDeposits,
    monthlyContrib,
    mgmtFeeBalance,
    mgmtFeeDeposit,
    returnYear,
    status: "active",
    annualContributionsBreakdown: annualDeposits
      ? { employee: annualDeposits, total: annualDeposits }
      : undefined,
    balanceMovements: hasMovements ? balanceMovements : undefined,
    investmentTracks: planName
      ? [
          {
            name: planName,
            annualReturnPct: returnYear,
            mgmtFeeBalancePct: mgmtFeeBalance,
            mgmtFeeDepositPct: mgmtFeeDeposit,
          },
        ]
      : undefined,
    notes,
  };
}

/**
 * Split a summary PDF into per-product blocks (each starts with section
 * "א. תשלומים צפויים") and parse each. Provider + report date are resolved once
 * at the file level since they repeat per page/product.
 */
function parseSummaryReport(
  text: string,
  filename: string,
  pages: number,
  source: "pdf" | "spreadsheet" | "text"
): ParsedAnnualReport {
  const warnings: string[] = [];
  const providerName = detectProvider(text);
  const isQuarterly = /רבעוני/.test(text);
  const reportDate = parseDate(
    text.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s*:?\s*תאריך\s*הדוח/)?.[1] ||
      text.match(/תאריך\s*הדוח\s*:?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/)?.[1]
  );

  // Block boundaries: each product begins at section "א. תשלומים צפויים".
  // Back up ~260 chars from there to include that product's identity/header
  // line (provider+product+account precede section A in the text flow).
  const LOOKBACK = 260;
  const aStarts = [...text.matchAll(/א\.\s*תשלומים\s*צפויים/g)].map((m) => m.index ?? 0);

  let blocks: string[];
  if (aStarts.length <= 1) {
    blocks = [text];
  } else {
    const bounds = aStarts.map((idx, i) => (i === 0 ? 0 : Math.max(0, idx - LOOKBACK)));
    blocks = bounds.map((start, i) =>
      text.slice(start, i + 1 < bounds.length ? bounds[i + 1] : text.length)
    );
  }

  const policies = blocks
    .map((b) => parseSummaryBlock(b, providerName, reportDate, isQuarterly, source))
    .filter((p): p is AnnualPolicy => p !== null);

  if (!policies.length) {
    warnings.push("לא נמצאה יתרת חיסכון בדוח");
    return { filename, pages, policies: [], warnings };
  }
  return { filename, pages, policies, warnings };
}

/* ═══════════════════════════════════════════════════════════ */
/* Main entry                                                    */
/* ═══════════════════════════════════════════════════════════ */

function parseAnnualReportText(
  text: string,
  filename: string,
  pages: number,
  source: "pdf" | "spreadsheet" | "text"
): ParsedAnnualReport {
  const warnings: string[] = [];

  if (!text.trim()) {
    warnings.push(source === "pdf" ? "PDF ריק או לא נקרא" : "הקובץ ריק או לא נקרא");
    return { filename, pages, policies: [], warnings };
  }

  if (
    /דוח\s+(?:יתרות\s+כספי|סכום\s+צבירה|סכום\s+צבירה\s+לחלוקת|סכום\s+צבירה\s+מזערי)/.test(text) ||
    /לצרכי\s+מס\s+הכנסה|חלוקת\s+חיסכון\s+פנסיוני\s+בין\s+בני\s+זוג/.test(text)
  ) {
    warnings.push("מסמך עזר של מסלקה פנסיונית נשמר כתיעוד, אך אינו מקור לטעינת מוצרים פנסיוניים");
    return { filename, pages, policies: [], warnings };
  }

  // ── Short summary (annual/quarterly) takes its own path ──
  if (isSummaryFormat(text)) {
    return parseSummaryReport(text, filename, pages, source);
  }

  // ── Provider + product (file-level) ──
  const providerName = detectProvider(text);
  const product = detectProduct(text);
  const reportDate = extractReportDate(text);
  const customer = extractCustomer(text);

  // ── Find all account numbers — each account becomes a separate policy ──
  // For now we extract a single "primary" policy per file. The harel hishtalmut
  // sample has 2 accounts (163173991, 71131747) but the totals row already sums
  // them. We'll capture the totals row balance and use the first account number
  // as the id, recording a note about additional accounts.
  const allAccountMatches = [
    ...text.matchAll(/(\d{6,12})\s*מספר\s*חשבון\s*העמית/g),
    ...text.matchAll(/מספר\s*חשבון\s*העמית[\s\/ה]*(\d{6,12})/g),
  ];
  const uniqueAccounts = Array.from(new Set(allAccountMatches.map((m) => m[1])));

  const accountNumber = extractAccountNumber(text) || uniqueAccounts[0] || "";
  const employer = extractEmployer(text);
  const joinDate = extractJoinDate(text);
  const planName = extractPlanName(text);
  const fees = extractMgmtFees(text);
  const returns = extractReturns(text);
  const pensionProj = extractProjectedPension(text);
  const salaryBase = extractSalaryBase(text);
  const annualDeposits = extractAnnualDeposits(text);
  const balance = extractBalance(text, reportDate);
  const annualContributionsBreakdown = extractAnnualContributionsBreakdown(text);
  const projectedCoverages = extractProjectedCoverages(text);
  const balanceMovements = extractBalanceMovements(text);
  const status = extractStatus(text);

  const annualDepositsTotal = annualContributionsBreakdown?.total ?? annualDeposits;
  // Monthly contribution = annual / 12 (if available)
  const monthlyContrib = annualDepositsTotal ? +(annualDepositsTotal / 12).toFixed(2) : undefined;

  const notes: string[] = [];
  if (source !== "pdf") {
    notes.push("חולץ מקובץ טבלאי/טקסטואלי — מומלץ לאמת מול מסמך המקור");
  }
  if (uniqueAccounts.length > 1) {
    notes.push(
      `${uniqueAccounts.length} חשבונות בקובץ — היתרה היא הסכום הכולל. חשבונות: ${uniqueAccounts.join(", ")}`
    );
  }

  const policy: AnnualPolicy = {
    id: `pdf_${providerName}_${accountNumber || Math.random().toString(36).slice(2, 8)}`,
    accountNumber,
    providerName,
    productType: product.type,
    productTypeLabel: product.label,
    planName: planName || product.label,
    customerName: customer.name,
    customerId: customer.id,
    employerName: employer,
    joinDate,
    liquidityDate: extractLiquidityDate(text),
    balance,
    reportDate,
    annualDeposits: annualDepositsTotal,
    monthlyContrib,
    mgmtFeeBalance: fees.balance,
    mgmtFeeDeposit: fees.deposit,
    returnYear: returns.year,
    return5y: returns.fiveY,
    projectedPensionAmount: pensionProj.amount,
    retirementAge: pensionProj.retireAge,
    salaryBase,
    status,
    annualContributionsBreakdown,
    projectedCoverages,
    balanceMovements,
    investmentTracks: extractInvestmentTracks(text, planName),
    notes: notes.length ? notes : undefined,
  };

  if (!balance && balanceMovements?.closingBalance === undefined) {
    warnings.push("לא נמצאה יתרת חיסכון בדוח");
  }
  if (!providerName || providerName === "לא זוהה") warnings.push("לא זוהה יצרן הקופה");
  if (!product.type || product.type === "unknown") warnings.push("לא זוהה סוג מוצר");

  return { filename, pages, policies: [policy], warnings };
}

export async function parseAnnualReportPdf(
  buffer: Buffer,
  filename: string
): Promise<ParsedAnnualReport> {
  try {
    const data = await pdfParse(buffer);
    return parseAnnualReportText(data.text || "", filename, data.numpages || 0, "pdf");
  } catch (e) {
    return {
      filename,
      pages: 0,
      policies: [],
      warnings: [`כשל בקריאת PDF: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

function worksheetToSearchText(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  });

  return rows
    .map((row) =>
      row
        .filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
        .join(" ")
    )
    .filter(Boolean)
    .join("\n");
}

export async function parseAnnualReportSpreadsheet(
  buffer: Buffer,
  filename: string
): Promise<ParsedAnnualReport> {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetTexts = workbook.SheetNames.map((name) => {
      const text = worksheetToSearchText(workbook.Sheets[name]);
      return text ? `גיליון ${name}\n${text}` : "";
    }).filter(Boolean);
    const text = sheetTexts.join("\n\n");
    return parseAnnualReportText(text, filename, workbook.SheetNames.length, "spreadsheet");
  } catch (e) {
    return {
      filename,
      pages: 0,
      policies: [],
      warnings: [`כשל בקריאת Excel: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

export async function parseAnnualReportTextFile(
  buffer: Buffer,
  filename: string
): Promise<ParsedAnnualReport> {
  const text = buffer.toString("utf8");
  return parseAnnualReportText(text, filename, 1, "text");
}

/* ═══════════════════════════════════════════════════════════ */
/* Bundle parser — multiple PDFs at once                         */
/* ═══════════════════════════════════════════════════════════ */

export async function parseAnnualReportBundle(
  files: { name: string; buffer: Buffer }[]
): Promise<ParsedAnnualBundle> {
  const parsed: ParsedAnnualReport[] = [];
  const allWarnings: string[] = [];

  for (const f of files) {
    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      const r =
        ext === "xlsx" || ext === "xls"
          ? await parseAnnualReportSpreadsheet(f.buffer, f.name)
          : ext === "csv" || ext === "txt"
            ? await parseAnnualReportTextFile(f.buffer, f.name)
            : await parseAnnualReportPdf(f.buffer, f.name);
      parsed.push(r);
      allWarnings.push(...r.warnings.map((w) => `[${f.name}] ${w}`));
    } catch (e) {
      allWarnings.push(`[${f.name}] כשל גורף: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Dedupe by policy id (= provider + account). When the same account appears
  // in more than one uploaded report (e.g. an annual + a quarterly report of
  // the same fund), keep only the most recent one by reportDate — otherwise the
  // preview list renders two rows with an identical React key.
  const rawPolicies = parsed.flatMap((f) => f.policies);
  const byId = new Map<string, AnnualPolicy>();
  for (const p of rawPolicies) {
    const existing = byId.get(p.id);
    if (!existing || (p.reportDate || "") > (existing.reportDate || "")) {
      byId.set(p.id, p);
    }
  }
  const policies = Array.from(byId.values());
  if (rawPolicies.length > policies.length) {
    allWarnings.push(
      `אוחדו ${rawPolicies.length - policies.length} דוחות כפולים (אותו חשבון) — נשמר הדוח העדכני ביותר`
    );
  }
  const totalBalance = policies.reduce((s, p) => s + p.balance, 0);
  const totalProjectedPension = policies.reduce((s, p) => s + (p.projectedPensionAmount ?? 0), 0);
  const totalMonthlyContrib = policies.reduce((s, p) => s + (p.monthlyContrib ?? 0), 0);

  const byType: Record<AnnualProductType, AnnualPolicy[]> = {
    pension_comprehensive: [],
    pension_general: [],
    insurance_manager: [],
    gemel: [],
    hishtalmut: [],
    gemel_investment: [],
    unknown: [],
  };
  for (const p of policies) byType[p.productType].push(p);

  const customerName = policies.find((p) => p.customerName)?.customerName;
  const customerId = policies.find((p) => p.customerId)?.customerId;

  return {
    files: parsed,
    policies,
    totalBalance,
    totalProjectedPension,
    totalMonthlyContrib,
    byType,
    warnings: allWarnings,
    customerName,
    customerId,
  };
}
