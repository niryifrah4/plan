/**
 * ═══════════════════════════════════════════════════════════
 *  Amortization PDF Parser — "לוח סילוקין"
 * ═══════════════════════════════════════════════════════════
 *
 * Heuristic parser for Israeli bank mortgage amortization PDFs. Each bank
 * has a different layout (Hapoalim, Leumi, Discount, Mizrahi, HaBeinleumi,
 * Otzar Hahayal). This parser uses a permissive line-scan that recognizes
 * common patterns rather than a per-bank template — coupled with a
 * "preview & confirm" UX so the planner can fix mistakes before save.
 *
 * Output shape matches `MortgageTrack` from debt-store, with two extras:
 *   - `confidence`  (0..1) per track — UI dims low-confidence rows
 *   - `sourceLine`  the raw text fragment, for debugging the preview modal
 *
 * Scope (Phase 4, 2026-05-21):
 *   - Extracts: track type/name, indexation, interest rate, current balance,
 *     monthly payment, end date when present.
 *   - Detects bank name from header text.
 *   - Returns "ambiguous" matches with confidence < 0.5 so the user can
 *     review before accepting.
 *   - Refuses to guess interest rate if no rate-looking number is on the line.
 *
 * Out of scope (deferred):
 *   - Scanned/image-only PDFs — caller can hand off to vision-pdf-parser.
 *   - Variable-rate next-reset dates — extract if obvious, leave undefined otherwise.
 *   - Grace-period detection.
 */

import type { IndexationType, RepaymentMethod } from "@/lib/debt-store";

export interface ParsedAmortizationTrack {
  /** Human-readable name as found in the PDF (e.g. "קל\"צ", "פריים"). */
  name: string;
  indexation: IndexationType;
  repaymentMethod: RepaymentMethod;
  /** Annual rate as DECIMAL fraction (0.048 = 4.8%) — Phase 1 standard. */
  interestRate: number;
  /** Optional margin over Prime when the track is Prime-linked. */
  margin?: number;
  originalAmount: number;
  remainingBalance: number;
  monthlyPayment: number;
  /** YYYY-MM if extracted, empty string otherwise. */
  startDate: string;
  endDate: string;
  totalPayments: number;
  /** 0..1 — how confident the heuristic is. UI dims < 0.5. */
  confidence: number;
  /** Raw source line for the preview modal. */
  sourceLine: string;
}

export interface AmortizationParseResult {
  bankHint: string;
  tracks: ParsedAmortizationTrack[];
  /** Aggregate totals if the PDF stated them — used for sanity-check in the UI. */
  totals?: {
    originalAmount?: number;
    remainingBalance?: number;
    monthlyPayment?: number;
  };
  /** Soft warnings — shown in the preview, never block the user. */
  warnings: string[];
}

/* ── Indexation classifier ─────────────────────────────────────────────── */

function classifyIndexation(text: string): IndexationType {
  const t = text.toLowerCase();
  if (/מדד|צמוד|index/.test(text)) {
    // "לא צמוד למדד" needs to be distinguished — check for the negation.
    if (/לא\s*צמוד/.test(text)) return "לא צמוד";
    return "מדד";
  }
  if (/דולר|usd|dollar/.test(t)) return "דולר";
  if (/לא\s*צמוד|unindex/.test(text)) return "לא צמוד";
  return "לא צמוד";
}

/* ── Repayment method classifier ───────────────────────────────────────── */

function classifyRepayment(text: string): RepaymentMethod {
  if (/שפיצר|spitzer/i.test(text)) return "שפיצר";
  if (/קרן\s*שווה|equal/i.test(text)) return "קרן שווה";
  if (/בלון|בולט|bullet|balloon/i.test(text)) return "בלון";
  return "שפיצר"; // 90%+ of Israeli mortgages
}

/* ── Track-type classifier ─────────────────────────────────────────────── */

function classifyTrackName(text: string): { name: string; isPrime: boolean } {
  if (/פריים|prime/i.test(text)) return { name: "פריים", isPrime: true };
  if (/קל[״"']?צ|לא\s*צמוד\s*קבוע/i.test(text)) return { name: "קל\"צ", isPrime: false };
  if (/ק[״"']?צ|צמוד\s*קבוע/i.test(text)) return { name: "ק\"צ", isPrime: false };
  if (/משק[״"']?ל|משתנה\s*צמוד/i.test(text)) return { name: "משק\"ל", isPrime: false };
  if (/משתנה|variable/i.test(text)) return { name: "משתנה", isPrime: false };
  if (/צמוד|index/.test(text)) return { name: "צמוד", isPrime: false };
  return { name: "מסלול", isPrime: false };
}

/* ── Bank-name detector ────────────────────────────────────────────────── */

function detectBank(text: string): string {
  const head = text.slice(0, 1500);
  if (/הפועלים|hapoalim|בנק פועלים/i.test(head)) return "בנק הפועלים";
  if (/לאומי|leumi/i.test(head)) return "בנק לאומי";
  if (/דיסקונט|discount/i.test(head)) return "בנק דיסקונט";
  if (/מזרחי|mizrahi|טפחות/i.test(head)) return "בנק מזרחי-טפחות";
  if (/בינלאומי|fibi/i.test(head)) return "הבינלאומי";
  if (/אוצר\s*החייל|otzar/i.test(head)) return "אוצר החייל";
  if (/ירושלים|jerusalem/i.test(head)) return "בנק ירושלים";
  return "";
}

/* ── Number extraction helpers ─────────────────────────────────────────── */

/** Extract all "numeric-looking" tokens from a line, in order. */
function extractNumbers(line: string): number[] {
  const out: number[] = [];
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Detect a percent-like number in a token list and convert to decimal.
 * Israeli mortgage rates are 0%–10% typically; a number with one decimal
 * place between 0.5 and 12 paired with a "%" sign nearby is a rate.
 * Returns the decimal value (e.g. 4.8 → 0.048) and its index.
 */
function findRate(line: string, numbers: number[]): { rate: number; index: number } | null {
  // Lines that contain "%" near a number — strongest signal.
  const percentIdx = line.indexOf("%");
  if (percentIdx >= 0) {
    // Find the closest number to the % sign.
    const reBefore = /(-?\d+(?:\.\d+)?)\s*%/g;
    let m;
    while ((m = reBefore.exec(line)) !== null) {
      const val = parseFloat(m[1]);
      if (val >= 0 && val < 20) {
        const idx = numbers.indexOf(val);
        return { rate: val / 100, index: idx >= 0 ? idx : 0 };
      }
    }
  }
  // Fallback: any plausible rate-shaped number.
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    if (n > 0 && n < 12 && !Number.isInteger(n) && n.toString().includes(".")) {
      return { rate: n / 100, index: i };
    }
  }
  return null;
}

/* ── Date helpers ─────────────────────────────────────────────────────── */

/** Extract a YYYY-MM from common Israeli date formats like "12/2034" or "01/12/2034". */
function findYearMonth(line: string): string {
  // YYYY (4-digit year alone)
  const yyMatch = line.match(/\b(20\d{2}|19\d{2})\b/);
  // MM/YYYY
  const mmYY = line.match(/\b(\d{1,2})[/.\-](20\d{2})\b/);
  if (mmYY) {
    const mm = String(parseInt(mmYY[1], 10)).padStart(2, "0");
    return `${mmYY[2]}-${mm}`;
  }
  // DD/MM/YYYY
  const dmy = line.match(/\b\d{1,2}[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
  if (dmy) {
    const mm = String(parseInt(dmy[1], 10)).padStart(2, "0");
    return `${dmy[2]}-${mm}`;
  }
  if (yyMatch) return `${yyMatch[1]}-01`;
  return "";
}

/* ── Main parser ──────────────────────────────────────────────────────── */

/**
 * Parse a "לוח סילוקין" PDF text into a list of probable mortgage tracks.
 *
 * The input is the raw text extracted by `pdf-parse` (or fallback OCR) —
 * lines may be reordered or interleaved depending on the bank's layout.
 * The parser is permissive: it returns everything that LOOKS like a track,
 * with a confidence score. The UI's preview-and-confirm step is responsible
 * for letting the user fix mistakes.
 */
export function parseAmortizationText(text: string): AmortizationParseResult {
  const warnings: string[] = [];
  const bankHint = detectBank(text);
  if (!bankHint) warnings.push("לא זוהה שם הבנק — ודאו ידנית שהנתונים שייכים לאותה משכנתא.");

  // Try to find aggregate totals if the PDF prints them.
  const totals: NonNullable<AmortizationParseResult["totals"]> = {};
  const sumLine = text.match(/יתרת\s*קרן\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/);
  if (sumLine) {
    const v = parseFloat(sumLine[1].replace(/,/g, ""));
    if (Number.isFinite(v)) totals.remainingBalance = v;
  }
  const monthlyLine = text.match(/החזר\s*חודשי\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/);
  if (monthlyLine) {
    const v = parseFloat(monthlyLine[1].replace(/,/g, ""));
    if (Number.isFinite(v)) totals.monthlyPayment = v;
  }
  const origLine = text.match(/קרן\s*מקורית\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/);
  if (origLine) {
    const v = parseFloat(origLine[1].replace(/,/g, ""));
    if (Number.isFinite(v)) totals.originalAmount = v;
  }

  // Scan lines that look like track rows. Heuristics:
  //   - Contains a known track-type label OR an indexation keyword
  //   - Contains 3+ numbers (balance, monthly, end-date year)
  //   - Has a rate-shaped number (with % or decimal)
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 10);

  const trackLines = lines.filter((line) => {
    const hasTrackKeyword =
      /פריים|prime|קל[״"']?צ|ק[״"']?צ|משק[״"']?ל|משתנה|צמוד|index/i.test(line);
    const numbers = extractNumbers(line);
    const hasRate =
      line.includes("%") ||
      numbers.some((n) => n > 0 && n < 12 && !Number.isInteger(n) && n.toString().includes("."));
    return hasTrackKeyword && numbers.length >= 2 && hasRate;
  });

  const tracks: ParsedAmortizationTrack[] = [];
  for (const line of trackLines) {
    const numbers = extractNumbers(line);
    const rateInfo = findRate(line, numbers);
    if (!rateInfo) continue;
    const { rate, index: rateIdx } = rateInfo;

    // Remove the rate number from the pool so it doesn't get mistaken for a balance.
    const moneyNumbers = numbers.filter((_, i) => i !== rateIdx).filter((n) => n > 100);
    moneyNumbers.sort((a, b) => b - a); // largest first

    const trackInfo = classifyTrackName(line);
    const indexation = classifyIndexation(line);
    const repaymentMethod = classifyRepayment(line);

    // Convention for heuristic: largest money number = original or balance,
    // smallest money number = monthly payment. For tracks with both original
    // and current balance, the user fixes in the preview.
    const monthlyPayment = moneyNumbers[moneyNumbers.length - 1] || 0;
    const remainingBalance = moneyNumbers[0] || 0;
    const originalAmount = moneyNumbers[1] || remainingBalance;
    const endDate = findYearMonth(line);

    // Confidence: full points for trackKeyword + rate + 2+ money numbers + end date.
    let confidence = 0.5;
    if (moneyNumbers.length >= 2) confidence += 0.2;
    if (endDate) confidence += 0.15;
    if (trackInfo.name !== "מסלול") confidence += 0.15;
    confidence = Math.min(1, confidence);

    tracks.push({
      name: trackInfo.name,
      indexation,
      repaymentMethod,
      interestRate: rate,
      margin: trackInfo.isPrime ? rate : undefined,
      originalAmount,
      remainingBalance,
      monthlyPayment,
      startDate: "",
      endDate,
      totalPayments: 0,
      confidence,
      sourceLine: line,
    });
  }

  // Sanity warnings.
  if (tracks.length === 0) {
    warnings.push("לא נמצאו מסלולי משכנתא בקובץ. ייתכן שמדובר בפורמט סרוק/לא-טקסטואלי.");
  }
  if (totals.remainingBalance && tracks.length > 0) {
    const sum = tracks.reduce((s, t) => s + t.remainingBalance, 0);
    const drift = Math.abs(sum - totals.remainingBalance) / totals.remainingBalance;
    if (drift > 0.05) {
      warnings.push(
        `סכום יתרות שזוהו (₪${Math.round(sum).toLocaleString("he-IL")}) שונה מהיתרה הכוללת בקובץ (₪${Math.round(totals.remainingBalance).toLocaleString("he-IL")}). בדקו לפני שמירה.`
      );
    }
  }

  return { bankHint, tracks, totals, warnings };
}
