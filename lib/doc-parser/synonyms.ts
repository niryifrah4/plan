/**
 * Hebrew Banking Synonym Dictionary
 * Maps various column header names from Israeli banks to canonical field names.
 */

export type CanonicalField = "date" | "description" | "debit" | "credit" | "balance";

const SYNONYM_MAP: Record<CanonicalField, string[]> = {
  date: [
    // Hebrew — all bank variants
    "תאריך",
    "תאריך פעולה",
    "תאריך עסקה",
    "תאריך ערך",
    "תאריך חיוב",
    "ת. עסקה",
    "ת. חיוב",
    "ת.פעולה",
    "ת.עסקה",
    "ת.חיוב",
    "תאריך העסקה",
    "תאריך הפעולה",
    "תאריך רכישה",
    "תאריך קנייה",
    "תאריך ביצוע",
    // Leumi specific
    "תאריך ביצוע הפעולה",
    "ת.ביצוע",
    // Discount specific
    "ת. ערך",
    "ת.ערך",
    // Mizrahi specific
    "תאריך תנועה",
    // Credit card dates
    "מועד חיוב",
    "מועד העסקה",
    "מועד רכישה",
    // English
    "date",
    "trans date",
    "value date",
    "transaction date",
    "posting date",
  ],
  description: [
    // Hebrew — all bank variants.
    // NOTE: "אסמכתא" (reference number) is deliberately EXCLUDED from this
    // list even though it is a common column header. Reason: in most bank
    // exports the reference column contains pure numbers, and when a row
    // also has a real text description column (תאור/פעולה/הפעולה) the
    // first-wins column detector would otherwise latch onto אסמכתא and
    // we'd show "282130" as the transaction description. The fallback loop
    // in parseExcel picks up a non-numeric text cell automatically if no
    // description column is detected at all.
    "תיאור",
    "פעולה",
    "תיאור פעולה",
    "שם בית עסק",
    "פרטים",
    "הפעולה",
    "שם בית העסק",
    "פירוט",
    "תיאור הפעולה",
    "פירוט הפעולה",
    "שם העסק",
    "שם עסק",
    "בית עסק",
    "שם בעל העסק",
    // Leumi specific
    "פעולה/אסמכתא",
    "תאור",
    "פרטי התנועה",
    // Leumi HTML format
    "תיאור התנועה",
    // Hapoalim HTML format
    "סוג תנועה",
    "סוג התנועה",
    // Mercantile / older Hapoalim
    "הפעולה",
    // Discount specific — combo column "פירוט/אסמכתא" IS a description
    "פירוט/אסמכתא",
    // Credit card specific
    "שם בית העסק/פירוט",
    'שם ביה"ע',
    "שם בית-עסק",
    "מקום הרכישה",
    "שם סוחר",
    // Mercantile
    "תאור הפעולה",
    // English
    "description",
    "details",
    "merchant",
    "payee",
    "narrative",
  ],
  debit: [
    // Hebrew — all bank variants
    "חובה",
    "סכום חיוב",
    "חיוב",
    "הוצאה",
    'סה"כ חיוב',
    'סכום בש"ח',
    "סכום העסקה",
    "סכום לחיוב",
    'סכום העסקה בש"ח',
    "סכום בשקלים",
    'סכום חיוב בש"ח',
    'סכום בש"ח לחיוב',
    "סכום",
    'סה"כ לחיוב',
    // Leumi specific
    "סכום",
    "סכום בש''ח",
    // Leumi HTML format
    "בחובה",
    // Discount combined column
    "₪ זכות/חובה",
    "זכות/חובה",
    // Discount specific
    "משיכות",
    "חובה / משיכות",
    // Mizrahi specific
    "סכום התנועה",
    "סכום פעולה",
    // Credit card specific
    'סכום חיוב ש"ח',
    "סכום חיוב בשח",
    "סכום עסקה בשח",
    "סכום עסקה",
    'סכום לחיוב בש"ח',
    'סה"כ בש"ח',
    "סכום בשקלים חדשים",
    'סכום עסקה בש"ח',
    // Isracard
    "סכום חיוב",
    "סכום החיוב",
    // Cal / Visa Cal
    "סכום לתשלום",
    // Max (Leumi Card)
    'סכום בש"ח',
    // English
    "debit",
    "charge",
    "amount",
    "withdrawal",
  ],
  credit: [
    // Hebrew — all bank variants
    "זכות",
    "סכום זיכוי",
    "זיכוי",
    "הכנסה",
    'סכום זיכוי בש"ח',
    // Leumi HTML format
    "בזכות",
    // Discount specific
    "הפקדות",
    "זכות / הפקדות",
    // Mizrahi
    "זכות / הכנסות",
    // English
    "credit",
    "refund",
    "deposit",
  ],
  balance: [
    // Hebrew — all bank variants
    "יתרה",
    "יתרה מצטברת",
    "יתרה בחשבון",
    "יתרת סגירה",
    "יתרה לאחר פעולה",
    // Discount
    "יתרה נוכחית",
    // English
    "balance",
    "running balance",
    "closing balance",
  ],
};

/**
 * Headers that look like valid synonyms but are actually CODES, not real
 * columns. Without this blacklist "קוד פעולה" would match description via
 * the "פעולה" substring and steal the column from the real "הפעולה" cell.
 */
const HEADER_BLACKLIST = [
  "קוד פעולה",
  "קוד אסמכתא",
  "קוד תנועה",
  "סוג פעולה", // ambiguous — can be an action-type code, not a description
  "מספר אסמכתא",
  "מספר פעולה",
  "ערוץ ביצוע",
  "צרור",
  "הערה",
];

export interface SynonymMatch {
  field: CanonicalField;
  /** Higher is better. Exact match > substring. */
  score: number;
}

/**
 * Given a raw header string, return the canonical field name or null.
 * (Back-compat: returns the field of the best match, ignoring score.)
 */
export function matchSynonym(raw: string): CanonicalField | null {
  return matchSynonymScored(raw)?.field ?? null;
}

/**
 * Like matchSynonym but returns a score so the caller can prefer
 * exact-match columns over substring matches. Score encoding:
 *   2000 + len = exact match
 *   1000 + len = substring match
 */
export function matchSynonymScored(raw: string): SynonymMatch | null {
  const cleaned = raw
    .trim()
    .replace(/[\u200F\u200E]/g, "")
    .toLowerCase();
  if (!cleaned) return null;

  // Short-circuit: blacklisted header → don't match anything
  if (HEADER_BLACKLIST.some((b) => cleaned === b.toLowerCase())) return null;

  let best: SynonymMatch | null = null;

  for (const [field, synonyms] of Object.entries(SYNONYM_MAP) as [CanonicalField, string[]][]) {
    for (const syn of synonyms) {
      const synLow = syn.toLowerCase();
      let score = 0;
      if (cleaned === synLow) score = 2000 + synLow.length;
      else if (cleaned.includes(synLow)) score = 1000 + synLow.length;
      if (score > 0 && (!best || score > best.score)) {
        best = { field, score };
      }
    }
  }
  return best;
}

/**
 * Detect bank name from content hints.
 */
// Credit cards — checked FIRST so a "Leumi Visa" statement isn't classified as "Bank Leumi",
// and a MAX file with "מפתח דיסקונט" column header isn't classified as Discount.
const CREDIT_CARD_HINTS: [string, string[]][] = [
  ["ישראכרט", ["ישראכרט", "isracard", "ישרא כרט"]],
  ["כאל", ["cal-online", "ויזה כאל", "visa cal", "כרטיסי אשראי לישראל", "כ.א.ל", "cal "]],
  [
    "מקס",
    ["-max", "max בהצדעה", "max-", "transaction-details_export_max", "leumi card", "לאומי קארד"],
  ],
  ["לאומי ויזה", ["ויזה בינלאומי", "לאומי לישראל", "לכרטיס ויזה"]],
  ["אמריקן אקספרס", ["אמריקן", "amex", "american express", "אמקס"]],
  ["דיינרס", ["דיינרס", "diners"]],
];

// Banks — checked only if no credit-card hint matched.
const BANK_HINTS: [string, string[]][] = [
  ["בנק הפועלים", ["הפועלים", "poalim", "bank hapoalim", "בנק 12"]],
  ["בנק לאומי", ["לאומי", "leumi", "בנק 10", "bank leumi"]],
  ["בנק דיסקונט", ["דיסקונט", "discount", "בנק 11", "bank discount"]],
  ["בנק מזרחי-טפחות", ["מזרחי", "טפחות", "mizrahi", "tefahot", "בנק 20", "umtb"]],
  ["בנק הבינלאומי", ["הבינלאומי", "fibi", "international", "בנק 31"]],
  ["בנק מרכנתיל", ["מרכנתיל", "mercantile", "בנק 17"]],
  ["בנק מסד", ["מסד", "massad", "בנק 46"]],
  ["בנק יהב", ["יהב", "yahav", "בנק 04"]],
  ["בנק הדואר", ["בנק הדואר", "דואר ישראל", "postal bank", "בנק 09"]],
  ["אוצר החייל", ["אוצר החייל", "otsar hahayal", "בנק 14"]],
  ["בנק ירושלים", ["ירושלים", "jerusalem", "בנק 54"]],
  ["וואן זירו", ["one zero", "וואן זירו", "1zero"]],
];

export function detectBank(text: string, opts?: { skipCreditCards?: boolean }): string {
  const lower = text.toLowerCase();
  // Credit cards first — strong signals trump bank-keyword collisions.
  // Skip when caller knows the file is a bank-format file (separate חובה/זכות columns)
  // — in that case credit-card brand names in transaction descriptions are noise.
  if (!opts?.skipCreditCards) {
    for (const [name, keywords] of CREDIT_CARD_HINTS) {
      if (keywords.some((k) => lower.includes(k))) return name;
    }
  }
  for (const [name, keywords] of BANK_HINTS) {
    if (keywords.some((k) => lower.includes(k))) return name;
  }
  // Fallback: account-number prefix (Israeli bank routing codes).
  // Pattern matches account number formats like "12-555-49541", "10-806-033562048".
  const prefixMatch = text.match(/(?:^|[\s:])(\d{2})[-\s/](\d{2,4})[-\s/]/);
  if (prefixMatch) {
    const code = prefixMatch[1];
    const byCode: Record<string, string> = {
      "04": "בנק יהב",
      "09": "בנק הדואר",
      "10": "בנק לאומי",
      "11": "בנק דיסקונט",
      "12": "בנק הפועלים",
      "13": "בנק איגוד",
      "14": "אוצר החייל",
      "17": "בנק מרכנתיל",
      "20": "בנק מזרחי-טפחות",
      "26": "יובנק",
      "31": "בנק הבינלאומי",
      "46": "בנק מסד",
      "52": "בנק פועלי אגודת ישראל",
      "54": "בנק ירושלים",
      "68": "בנק דקסיה",
    };
    if (byCode[code]) return byCode[code];
  }
  return "לא זוהה";
}
