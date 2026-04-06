/**
 * Hebrew Banking Synonym Dictionary
 * Maps various column header names from Israeli banks to canonical field names.
 */

export type CanonicalField = "date" | "description" | "debit" | "credit" | "balance";

const SYNONYM_MAP: Record<CanonicalField, string[]> = {
  date: [
    "תאריך", "תאריך פעולה", "תאריך עסקה", "תאריך ערך",
    "תאריך חיוב", "ת. עסקה", "ת. חיוב", "ת.פעולה",
    "date", "trans date", "value date",
  ],
  description: [
    "תיאור", "פעולה", "תיאור פעולה", "שם בית עסק",
    "פרטים", "הפעולה", "שם בית העסק", "פירוט",
    "אסמכתא", "description", "details", "merchant",
  ],
  debit: [
    "חובה", "סכום חיוב", "חיוב", "הוצאה",
    "סה\"כ חיוב", "סכום בש\"ח", "סכום העסקה",
    "סכום לחיוב", "סכום העסקה בש\"ח", "סכום בשקלים",
    "סכום חיוב בש\"ח", "סכום בש\"ח לחיוב",
    "סכום", "סה\"כ לחיוב",
    "debit", "charge", "amount",
  ],
  credit: [
    "זכות", "סכום זיכוי", "זיכוי", "הכנסה",
    "סכום זיכוי בש\"ח",
    "credit", "refund",
  ],
  balance: [
    "יתרה", "יתרה מצטברת", "יתרה בחשבון",
    "balance", "running balance",
  ],
};

/**
 * Given a raw header string, return the canonical field name or null.
 */
export function matchSynonym(raw: string): CanonicalField | null {
  const cleaned = raw.trim().replace(/[\u200F\u200E]/g, "").toLowerCase();
  if (!cleaned) return null;

  // Collect all matches, prefer exact matches and longer synonyms
  let bestMatch: CanonicalField | null = null;
  let bestLen = 0;
  let isExact = false;

  for (const [field, synonyms] of Object.entries(SYNONYM_MAP) as [CanonicalField, string[]][]) {
    for (const syn of synonyms) {
      const synLow = syn.toLowerCase();
      if (cleaned === synLow) {
        // Exact match — prefer longest exact match
        if (!isExact || synLow.length > bestLen) {
          bestMatch = field;
          bestLen = synLow.length;
          isExact = true;
        }
      } else if (!isExact && cleaned.includes(synLow) && synLow.length > bestLen) {
        bestMatch = field;
        bestLen = synLow.length;
      }
    }
  }
  return bestMatch;
}

/**
 * Detect bank name from content hints.
 */
const BANK_HINTS: [string, string[]][] = [
  ["בנק הפועלים",   ["הפועלים", "poalim", "bank hapoalim"]],
  ["בנק לאומי",     ["לאומי", "leumi"]],
  ["בנק דיסקונט",   ["דיסקונט", "discount"]],
  ["בנק מזרחי-טפחות", ["מזרחי", "טפחות", "mizrahi", "tefahot"]],
  ["בנק הבינלאומי",  ["הבינלאומי", "fibi", "international"]],
  ["ישראכרט",       ["ישראכרט", "isracard"]],
  ["כאל",           ["כאל", "cal"]],
  ["מקס",           ["מקס", "max"]],
  ["ויזה",          ["ויזה", "visa cal"]],
  ["אמריקן אקספרס", ["אמריקן", "amex", "american express"]],
];

export function detectBank(text: string): string {
  const lower = text.toLowerCase();
  for (const [name, keywords] of BANK_HINTS) {
    if (keywords.some(k => lower.includes(k))) return name;
  }
  return "לא זוהה";
}
