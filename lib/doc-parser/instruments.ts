/**
 * Financial Instrument Extractor
 * Detects bank accounts and credit card identifiers from scanned file content.
 *
 * Strategy:
 *   - PDF: scan full text for account number patterns + credit card last-4
 *   - Excel: scan header/metadata rows (first 10 rows) for account identifiers
 *   - Deduplication: unique list by (type + identifier + institution)
 */

export type InstrumentType = "bank_account" | "credit_card";

export interface FinancialInstrument {
  type: InstrumentType;
  institution: string; // e.g. "בנק הפועלים", "ישראכרט"
  identifier: string; // account number or last 4 digits
  label: string; // display string, e.g. "בנק הפועלים (חשבון 351141)"
  /** Day-of-month the monthly debit hits the bank (1-28). Extracted from
   * credit-card statements that print "תאריך חיוב בחשבון: 5". Optional —
   * absent for bank accounts and for cards whose statement omits the date. */
  billingDay?: number;
}

/**
 * Known credit card companies — used to classify instrument type.
 */
const CREDIT_CARD_INSTITUTIONS = [
  "ישראכרט",
  "כאל",
  "מקס",
  "ויזה כאל",
  "ויזה",
  "אמריקן אקספרס",
  "לאומי ויזה",
  "ויזה בינלאומי",
  "דיינרס",
];

function isCreditCardInstitution(bank: string): boolean {
  return CREDIT_CARD_INSTITUTIONS.some((cc) => bank.includes(cc));
}

/**
 * Pull the day-of-month the card debits the bank account.
 *
 * Israeli credit-card statements consistently print this near the top of
 * the document with phrasing like:
 *   "תאריך החיוב בחשבון: 05/06/2026"
 *   "מועד חיוב: 05.06.2026"
 *   "חיוב חודשי ביום ה-5 לכל חודש"
 *   "billing date: 05/06/2026"
 *
 * The DAY-of-month is the useful bit (the year and month change every
 * statement; the day is the predictable signal). We strip the date back
 * to its day component and validate 1-28 (excluding 29-31 to avoid
 * month-edge cases where the bank actually charges on the previous workday).
 *
 * Returns null when no recognizable pattern is found.
 */
function extractBillingDay(text: string): number | null {
  // Pattern 1: "תאריך החיוב בחשבון: DD/MM/YYYY" or "DD.MM.YYYY" or "DD-MM-YYYY"
  // Also catches "מועד חיוב", "תאריך חיוב", "חיוב הכרטיס"
  const datedRx = /(?:תאריך\s*ה?חיוב(?:\s*בחשבון)?|מועד\s*ה?חיוב|חיוב\s*ה?כרטיס|billing\s*date)\s*[:.\-]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i;
  const datedMatch = text.match(datedRx);
  if (datedMatch) {
    const day = parseInt(datedMatch[1], 10);
    if (day >= 1 && day <= 28) return day;
  }

  // Pattern 2: "חיוב ביום ה-5 לכל חודש" / "חיוב ביום 5 בחודש" — explicit day-of-month
  const dayOfMonthRx = /חיוב(?:\s*חודשי)?\s*ביום\s*ה?[-\s]?(\d{1,2})\b/i;
  const domMatch = text.match(dayOfMonthRx);
  if (domMatch) {
    const day = parseInt(domMatch[1], 10);
    if (day >= 1 && day <= 28) return day;
  }

  // Pattern 3: "ליום ה-5 בכל חודש" / "ה-5 לחודש"
  const literalDomRx = /(?:ליום|ל[-\s]?חודש)\s*ה?[-\s]?(\d{1,2})\b/i;
  const litMatch = text.match(literalDomRx);
  if (litMatch) {
    const day = parseInt(litMatch[1], 10);
    if (day >= 1 && day <= 28) return day;
  }

  return null;
}

/**
 * Extract account numbers from text content (PDF or Excel flattened text).
 *
 * Patterns detected:
 *   - "חשבון 123456" / "חשבון מס' 123456" / "מספר חשבון: 123456"
 *   - "account 123456" / "account no 123456"
 *   - Last 4 digits patterns: "כרטיס ...3014" / "xxxx-3014" / "****3014"
 *   - "סיומת 3014" / "4 ספרות אחרונות: 3014"
 *   - Branch + account: "סניף 123 חשבון 456789"
 */
export function extractInstruments(text: string, bankHint: string): FinancialInstrument[] {
  const found: FinancialInstrument[] = [];
  const seen = new Set<string>();

  const addUnique = (inst: FinancialInstrument) => {
    const key = `${inst.type}::${inst.institution}::${inst.identifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(inst);
  };

  const isCreditCard = isCreditCardInstitution(bankHint);
  const cleaned = text.replace(/[\u200F\u200E]/g, "");

  // Compute billing day ONCE for the whole doc. Every credit-card instrument
  // found in this statement gets the same day stamped on it — the statement
  // covers a single card, the day is a card-level (actually card-account
  // level) attribute, not per-transaction. Falls back to null when the
  // statement doesn't print the date in a recognized format.
  const billingDay = isCreditCard ? extractBillingDay(cleaned) : null;

  // Skip bank-account detection when the document is a credit card statement
  // (prevents e.g. "לאומי לישראל 806-33562048" header on a Leumi Visa statement
  //  from being logged as a bank account under the card's institution).
  if (!isCreditCard) {
    // ── Pattern 1: Bank account numbers ──
    // "חשבון 123456" / "חשבון מס' 123456" / "מספר חשבון: 123456"
    // Also Leumi format "806-33562048" or "806-335620/48" (branch-account with optional extension)
    const accountPatterns = [
      /(?:חשבון|מספר\s*חשבון|חש['׳]|account)\s*(?:מס['\u0027׳]?\s*)?[:.]?\s*(\d{3,4}[-\/]?\d{4,9}(?:[-\/]\d{1,3})?)/gi,
      // Bank Yahav (and similar) triple-segment format "04-131-011822"
      // (bank-branch-account) — leads with a 2-digit bank code, which the
      // pattern above (requires \d{3,4} first) can't match.
      /(?:חשבון|מספר\s*חשבון|חש['׳]|account)\s*(?:מס[''׳]?\s*)?[:.]?\s*(\d{2,3}-\d{3}-\d{3,9})/gi,
      /(?:סניף)\s*\d{2,4}\s*(?:חשבון|חש['׳]?)\s*[:.]?\s*(\d{4,9})/gi,
      // Leumi header: "לאומי לישראל 806-33562048" / "806-335620/48"
      /(?:לאומי לישראל|בנק\s+\S+)\s+(\d{3,4}[-\/]\d{4,10}(?:[-\/]\d{1,3})?)/gi,
    ];

    for (const rx of accountPatterns) {
      let m;
      while ((m = rx.exec(cleaned)) !== null) {
        const accountNum = m[1].replace(/\s+/g, "");
        // Accept dashed/slashed branch-account identifiers up to 16 chars
        if (accountNum.replace(/[-\/]/g, "").length >= 4 && accountNum.length <= 16) {
          addUnique({
            type: "bank_account",
            institution: bankHint !== "לא זוהה" ? bankHint : "בנק",
            identifier: accountNum,
            label: `${bankHint !== "לא זוהה" ? bankHint : "בנק"} (חשבון ${accountNum})`,
          });
        }
      }
    }
  }

  // ── Pattern 2: Credit card last 4 digits ──
  const last4Patterns = [
    // "xxxx-3014" / "XXXX3014" / "****3014" / "...3014"
    /(?:x{3,4}|X{3,4}|\*{3,4}|\.{3,4})[-\s]?(\d{4})/g,
    // "סיומת 3014" / "4 ספרות אחרונות 3014"
    /(?:סיומת|ספרות\s*אחרונות)\s*[:.]?\s*(\d{4})/gi,
    // "המסתיים ב-8645" / "המסתיים ב 8645" (Leumi Visa format)
    /המסתיים\s*ב[-\s]?(\d{4})/gi,
    // "כרטיס מס' ... 3014" / "כרטיס 1234-5678-9012-3014" — require the 4 digits
    // within ~25 chars of "כרטיס" so we don't pick up dates like "15-02-2026".
    /כרטיס\s*(?:מס['\u0027׳]?\s*)?[:.\-\s]{0,25}?(\d{4})\b/gi,
    // "card ending 3014"
    /card\s*(?:ending|ends?)\s*[:.]?\s*(\d{4})/gi,
    // MAX export header: "3428-max" / "3428 max" / "3428-max בהצדעה"
    /\b(\d{4})[-\s]max\b/gi,
  ];

  for (const rx of last4Patterns) {
    let m;
    while ((m = rx.exec(cleaned)) !== null) {
      const last4 = m[1];
      // Filter year-like numbers (2000-2099) — catches "15-02-2026" false positives
      // from loose patterns around "כרטיס האשראי" headers.
      const n = parseInt(last4, 10);
      if (n >= 2000 && n <= 2099) continue;
      addUnique({
        type: "credit_card",
        institution: isCreditCard && bankHint !== "לא זוהה" ? bankHint : "כרטיס אשראי",
        identifier: last4,
        label: `${isCreditCard && bankHint !== "לא זוהה" ? bankHint : "כרטיס אשראי"} (סיומת ${last4})`,
        ...(billingDay != null ? { billingDay } : {}),
      });
    }
  }

  // ── Pattern 3: Full credit card numbers (extract last 4) ──
  // "4580-1234-5678-3014" or "4580 1234 5678 3014"
  const fullCardRx = /\b(\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})\b/g;
  let m;
  while ((m = fullCardRx.exec(cleaned)) !== null) {
    const last4 = m[4];
    addUnique({
      type: "credit_card",
      institution: isCreditCard && bankHint !== "לא זוהה" ? bankHint : "כרטיס אשראי",
      identifier: last4,
      label: `${isCreditCard && bankHint !== "לא זוהה" ? bankHint : "כרטיס אשראי"} (סיומת ${last4})`,
      ...(billingDay != null ? { billingDay } : {}),
    });
  }

  // ── Pattern 4: If bank detected as credit card but no card found, use bankHint itself ──
  // Some credit card statements show "ישראכרט" in header but last-4 is in a specific format
  if (isCreditCard && found.filter((f) => f.type === "credit_card").length === 0) {
    // Try a broader pattern: any standalone 4-digit number near "כרטיס" or at top of document
    const topText = cleaned.substring(0, 500);
    const broadCardRx = /\b(\d{4})\b/g;
    const candidates: string[] = [];
    let bm;
    while ((bm = broadCardRx.exec(topText)) !== null) {
      const n = bm[1];
      // Exclude year-like numbers and common noise
      if (parseInt(n) >= 1900 && parseInt(n) <= 2100) continue;
      if (n === "0000") continue;
      candidates.push(n);
    }
    // Take the FIRST candidate — the card suffix is almost always in the top header,
    // and "last candidate" was picking up dates in the first data row.
    if (candidates.length > 0) {
      const last4 = candidates[0];
      addUnique({
        type: "credit_card",
        institution: bankHint,
        identifier: last4,
        label: `${bankHint} (סיומת ${last4})`,
        ...(billingDay != null ? { billingDay } : {}),
      });
    }
  }

  return found;
}

/* ──────── Persistence (localStorage) ──────── */
import { scopedKey } from "../client-scope";

const INSTRUMENTS_KEY = "verdant:financial_instruments";

export interface StoredInstruments {
  instruments: FinancialInstrument[];
  updatedAt: string;
}

export function loadInstruments(): FinancialInstrument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(INSTRUMENTS_KEY));
    if (!raw) return [];
    const parsed: StoredInstruments = JSON.parse(raw);
    return parsed.instruments || [];
  } catch {
    return [];
  }
}

/**
 * Merge newly detected instruments into the stored list (dedup by key).
 * When the same instrument is re-detected with NEW metadata (e.g. a
 * later statement finally prints the billingDay that earlier ones omitted),
 * the existing record is upgraded in-place so the user keeps the better info.
 */
export function mergeAndSaveInstruments(
  newInstruments: FinancialInstrument[]
): FinancialInstrument[] {
  const existing = loadInstruments();
  const indexByKey = new Map<string, number>();
  existing.forEach((i, idx) =>
    indexByKey.set(`${i.type}::${i.institution}::${i.identifier}`, idx)
  );
  const merged = [...existing];

  for (const inst of newInstruments) {
    const key = `${inst.type}::${inst.institution}::${inst.identifier}`;
    const existingIdx = indexByKey.get(key);
    if (existingIdx == null) {
      indexByKey.set(key, merged.length);
      merged.push(inst);
    } else {
      // Upgrade: fill in any field the existing record was missing. Never
      // overwrite a non-empty existing value (the older statement might be
      // more accurate, or the user might have edited it later).
      const old = merged[existingIdx];
      const upgraded: FinancialInstrument = { ...old };
      if (old.billingDay == null && inst.billingDay != null) {
        upgraded.billingDay = inst.billingDay;
      }
      merged[existingIdx] = upgraded;
    }
  }

  if (typeof window !== "undefined") {
    const stored: StoredInstruments = {
      instruments: merged,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(scopedKey(INSTRUMENTS_KEY), JSON.stringify(stored));
  }

  return merged;
}

/**
 * Get summary counts.
 */
export function getInstrumentSummary(instruments: FinancialInstrument[]): {
  banks: number;
  cards: number;
} {
  return {
    banks: instruments.filter((i) => i.type === "bank_account").length,
    cards: instruments.filter((i) => i.type === "credit_card").length,
  };
}
