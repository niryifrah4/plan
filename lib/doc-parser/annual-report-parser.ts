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
  ["הראל", ["הראל", "harel"]],
  ["מגדל", ["מגדל", "magdal", "migdal"]],
  ["מנורה", ["מנורה", "menora", "מבטחים"]],
  ["הפניקס", ["הפניקס", "phoenix", "fnx"]],
  ["מיטב", ["מיטב", "meitav"]],
  ["אלטשולר שחם", ["אלטשולר", "altshuler"]],
  ["אנליסט", ["אנליסט", "analyst"]],
  ["ילין לפידות", ["ילין", "yelin", "lapidot"]],
  ["כלל", ["כלל", "clal"]],
  ["מור", ["מור גמל", "מור השקעות", "more"]],
  ["פסגות", ["פסגות", "psagot"]],
  ["אינפיניטי", ["אינפיניטי", "infinity"]],
];

function detectProvider(text: string): string {
  const lower = text.toLowerCase();
  for (const [name, kws] of PROVIDER_HINTS) {
    if (kws.some((k) => lower.includes(k))) return name;
  }
  return "לא זוהה";
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
  const idMatch = text.match(/(\d{9})\s*מספר\s*תעודת\s*זהות/);
  const id = idMatch?.[1];

  // Look for name strictly between the two labels
  const nameSlice = text.match(/מספר\s*תעודת\s*זהות([\u0590-\u05FF\s'"-]{1,40}?)שם\s*העמית/);
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
  const m = text.match(/\n([\u0590-\u05FF][\u0590-\u05FF '"-]{1,30}?)\s*שם\s*המעסיק\s*האחרון/);
  if (!m) return undefined;
  const candidate = m[1].replace(/\s+/g, " ").trim();
  // Reject obvious junk labels
  if (/ותק|מעמד|מצב|תקופ|מסלול|מספר|מועד|כתובת|לעניין|לפי/.test(candidate)) {
    return undefined;
  }
  return candidate;
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
    text.match(/([\u0590-\u05FF][\u0590-\u05FF\s\-']{2,40}?)\s*מסלול\s*ההשקעה\s*בו\s*מנוהלים/) ||
    text.match(/שם\s*מסלול\s*השקעה[\s\S]{0,100}?([\u0590-\u05FF][\u0590-\u05FF\s\-']{2,40})/);
  return m?.[1]?.trim();
}

function extractMgmtFees(text: string): { balance?: number; deposit?: number } {
  // PDF row format example (Harel pension):
  //   "0.13%0.50%31/12/20280.14%0.14%129.04דמי ניהול מהחיסכון המצטבר"
  // Order in text: avg-of-industry, max-without-discount, end-of-discount, current, current(repeat), sum-shekels, LABEL
  // We want the CURRENT rate — that's the percentage closest to the label
  // (last percentage immediately before the shekels amount and label).
  const balRow = text.match(/([\d.]+)%\s*[\d.,]+\s*דמי\s*ניהול\s*מהחיסכון\s*המצטבר/);
  const depRow = text.match(/([\d.]+)%\s*[\d.,]+\s*דמי\s*ניהול\s*מהפקדה\s*שוטפת/);
  return {
    balance: balRow ? parseFloat(balRow[1]) : undefined,
    deposit: depRow ? parseFloat(depRow[1]) : undefined,
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
  // Alt: just the amount
  const m2 = text.match(/([\d,]+\.\d{2})\s*קצבה\s*חודשית\s*צפויה\s*בפרישה/);
  if (m2) return { amount: parseAmount(m2[1]) };
  return {};
}

function extractSalaryBase(text: string): number | undefined {
  // "17,443.96משכורת קובעת לנכות ושאירים" or "סבסיס משכורת על שהופקדו"
  const m = text.match(/([\d,]+\.\d{2})\s*משכורת\s*קובעת/);
  return m ? parseAmount(m[1]) : undefined;
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
  const flow = text.match(/([\d,]+\.\d{2})[\d.,\s]*?הפקדות\s*כספים\s*ל(?:קרן|חשבון)/);
  if (flow) return parseAmount(flow[1]);
  return undefined;
}

/* ═══════════════════════════════════════════════════════════ */
/* Main entry                                                    */
/* ═══════════════════════════════════════════════════════════ */

export async function parseAnnualReportPdf(
  buffer: Buffer,
  filename: string
): Promise<ParsedAnnualReport> {
  const warnings: string[] = [];
  let text = "";
  let pages = 0;

  try {
    const data = await pdfParse(buffer);
    text = data.text || "";
    pages = data.numpages || 0;
  } catch (e) {
    warnings.push(`כשל בקריאת PDF: ${e instanceof Error ? e.message : String(e)}`);
    return { filename, pages: 0, policies: [], warnings };
  }

  if (!text.trim()) {
    warnings.push("PDF ריק או לא נקרא");
    return { filename, pages, policies: [], warnings };
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

  // Monthly contribution = annual / 12 (if available)
  const monthlyContrib = annualDeposits ? +(annualDeposits / 12).toFixed(2) : undefined;

  const notes: string[] = [];
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
    balance,
    reportDate,
    annualDeposits,
    monthlyContrib,
    mgmtFeeBalance: fees.balance,
    mgmtFeeDeposit: fees.deposit,
    returnYear: returns.year,
    return5y: returns.fiveY,
    projectedPensionAmount: pensionProj.amount,
    retirementAge: pensionProj.retireAge,
    salaryBase,
    notes: notes.length ? notes : undefined,
  };

  if (!balance) warnings.push("לא נמצאה יתרת חיסכון בדוח");
  if (!providerName || providerName === "לא זוהה") warnings.push("לא זוהה יצרן הקופה");
  if (!product.type || product.type === "unknown") warnings.push("לא זוהה סוג מוצר");

  return { filename, pages, policies: [policy], warnings };
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
      const r = await parseAnnualReportPdf(f.buffer, f.name);
      parsed.push(r);
      allWarnings.push(...r.warnings.map((w) => `[${f.name}] ${w}`));
    } catch (e) {
      allWarnings.push(`[${f.name}] כשל גורף: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const policies = parsed.flatMap((f) => f.policies);
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
