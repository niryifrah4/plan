/**
 * Sub-Category Schema — The Verdant Hierarchy
 *
 * Each Bucket contains Sub-categories.
 * Each Sub-category contains keyword matchers for auto-assignment.
 *
 * Hierarchy:  Bucket → Sub-category → Transaction
 *
 * Fixed:      דיור, חשבונות בית, תקשורת, ביטוחים, חינוך קבוע
 * Variable:   מזון וצריכה, תחבורה, פנאי ומסעדות, קניות וביגוד, בריאות משתנה
 */

import type { Bucket } from "./buckets";

export interface SubCategory {
  key: string;
  label: string;
  icon: string;
  bucket: Bucket;
  /** Keywords in description that map to this sub-category */
  keywords: string[];
  /** Category keys that default to this sub-category */
  categoryKeys: string[];
}

/* ─────────────── Fixed Sub-categories ─────────────── */

const HOUSING: SubCategory = {
  key: "housing_sub",
  label: "דיור",
  icon: "home",
  bucket: "fixed",
  keywords: [
    "שכירות", "שכ\"ד", "משכנתא", "ועד בית", "ועד הבית",
    "דירה", "שיפוץ", "עמידר", "בנק אדנים",
  ],
  categoryKeys: ["housing"],
};

const HOME_BILLS: SubCategory = {
  key: "home_bills",
  label: "חשבונות בית",
  icon: "bolt",
  bucket: "fixed",
  keywords: [
    "ארנונה", "חשמל", "חב' חשמל", "חברת חשמל", "iec",
    "מים", "מי אביבים", "מי שבע", "מקורות", "גיחון",
    "גז", "עיריית", "עירייה", "israel electric",
  ],
  categoryKeys: ["utilities"],
};

const TELECOM: SubCategory = {
  key: "telecom",
  label: "תקשורת",
  icon: "smartphone",
  bucket: "fixed",
  keywords: [
    "בזק", "פרטנר", "סלקום", "הוט", "cellcom",
    "012", "013", "bezeq", "hot net", "הוט מובייל",
    "yes", "אינטרנט", "סלולר",
    "נטפליקס", "netflix", "ספוטיפיי", "spotify",
    "אפל מיוזיק", "apple", "דיסני", "disney", "hbo",
    "אמזון פריים", "amazon prime",
    "google storage", "icloud", "dropbox", "zoom",
    "microsoft 365", "canva", "adobe", "chatgpt", "openai",
    "מנוי", "חודשי",
  ],
  categoryKeys: ["subscriptions"],
};

const INSURANCE: SubCategory = {
  key: "insurance_sub",
  label: "ביטוחים",
  icon: "shield",
  bucket: "fixed",
  keywords: [
    "ביטוח", "מגדל", "הראל", "כלל ביטוח", "הפניקס", "מנורה",
    "איילון", "שלמה ביטוח", "ביטוח לאומי",
    "ביטוח בריאות", "ביטוח חיים", "ביטוח רכב", "ביטוח דירה",
  ],
  categoryKeys: ["insurance"],
};

const EDU_FIXED: SubCategory = {
  key: "edu_fixed",
  label: "חינוך קבוע",
  icon: "school",
  bucket: "fixed",
  keywords: [
    "גן ילדים", "גן", "בית ספר", "צהרון", "מעון",
    "חוג", "שיעור", "קייטנה", "שכר לימוד",
    "אוניברסיטה", "מכללה", "קורס", "הרשמה", "טרום חובה",
  ],
  categoryKeys: ["education"],
};

const PENSION_FIXED: SubCategory = {
  key: "pension_fixed",
  label: "פנסיה וחיסכון",
  icon: "savings",
  bucket: "fixed",
  keywords: [
    "פנסיה", "גמל", "השתלמות", "הפרשה", "פיצויים",
    "מיטב דש", "אלטשולר", "מור", "פסגות",
  ],
  categoryKeys: ["pension"],
};

const FEES_FIXED: SubCategory = {
  key: "fees_fixed",
  label: "עמלות וריביות",
  icon: "receipt_long",
  bucket: "fixed",
  keywords: [
    "עמלה", "דמי כרטיס", "ריבית", "דמי ניהול חשבון",
    "דמי ניהול", "עמלת פעולה", "דמי שימוש", "עמלת המרה",
    "עמלת העברה", "דמי חיוב", "ריבית חובה", "ריבית פיגורים",
    "עמלת כרטיס", "דמי כספומט", "עמלת בנק",
  ],
  categoryKeys: ["fees"],
};

/* ─────────────── Variable Sub-categories ─────────────── */

const GROCERY: SubCategory = {
  key: "grocery",
  label: "מזון וצריכה",
  icon: "shopping_cart",
  bucket: "variable",
  keywords: [
    "שופרסל", "רמי לוי", "מגה", "מגה בעיר", "מגה בול",
    "יוחננוף", "חצי חינם", "אושר עד", "טיב טעם",
    "ויקטורי", "סופר סול", "פרש מרקט", "סופר ברקת",
    "זול ובגדול", "מחסני השוק", "סופר דוש", "קינג סטור",
    "שוק", "מכולת", "ירקות", "פירות",
    "am:pm", "yellow", "כל בו",
    "תנובה", "טרה", "שטראוס", "אסם", "עלית",
    "מאפייה", "לחם ארז", "אנגלס", "רולדין",
    "ניקיון", "מרקחת",
    // Note: סופר-פארם is in HEALTH_VAR, not here — prevents conflict
  ],
  categoryKeys: ["food"],
};

const TRANSPORT_VAR: SubCategory = {
  key: "transport_var",
  label: "תחבורה",
  icon: "directions_car",
  bucket: "variable",
  keywords: [
    // ── Gas ──
    "פז", "דלק", "סונול", "דור אלון", "ten", "אלון", "דלק אנרגיה", "תעם+",
    // ── Parking ──
    "חניה", "חניון", "פנגו", "סלופארק", "cellopark",
    // ── Public transport ──
    "אגד", "דן", "רכבת", "רכבת ישראל", "קו קווים", "מטרופולין",
    "רב קו", "rav kav", "נתיבי איילון", "תחבורה ציבורית",
    // ── Taxis ──
    "מונית", "gett", "גט טקסי", "yango", "יאנגו", "uber",
    // ── Vehicle ──
    "טסט", "רישוי", "אגרת רישוי",
    // ── Rental ──
    "אלדן", "שלמה סיקסט", "hertz", "avis", "budget", "אוטותל", "סיקסט",
  ],
  categoryKeys: ["transport"],
};

const DINING: SubCategory = {
  key: "dining",
  label: "פנאי ומסעדות",
  icon: "restaurant",
  bucket: "variable",
  keywords: [
    // ── Restaurants & cafés ──
    "מסעדה", "קפה", "בית קפה", "ארומה", "קופי",
    "קפה הלל", "קפה אורבן", "קפה לנדוור", "קפה קפה",
    "קפה גרג", "ברסטה", "coffee bean",
    // ── Fast food ──
    "מקדונלדס", "mcdonald", "בורגר קינג", "burger king",
    "דומינוס", "פיצה האט", "kfc",
    // ── Delivery ──
    "wolt", "וולט", "japanika", "ג'פניקה", "תן ביס", "ten bis",
    "cibus", "סיבוס", "משלוחה",
    // ── Asian / sushi ──
    "סושי", "נגיסה", "אדו", "נודה",
    // ── Bars / entertainment ──
    "פאב", "בר", "מייק פלייס", "מולי בלום",
    "סינמה", "קולנוע", "yes planet", "סינמה סיטי",
    "הופעה", "הצגה", "תיאטרון", "הבימה", "קאמרי",
    // ── Fitness ──
    "ספורט", "חדר כושר", "הולמס", "הולמס פלייס", "גו אקטיב",
    // ── Parks ──
    "פארק", "לונה פארק", "ספארי",
  ],
  categoryKeys: ["leisure"],
};

const DINING_OUT_VAR: SubCategory = {
  key: "dining_out_var",
  label: "אוכל בחוץ ובילויים",
  icon: "restaurant",
  bucket: "variable",
  keywords: [
    "מסעדה", "קפה", "בית קפה", "ארומה", "קופי",
    "קפה הלל", "קפה אורבן", "ברסטה", "קפה גרג",
    "קפה לנדוור", "קפה קפה", "coffee bean",
    "מקדונלדס", "mcdonald", "בורגר קינג", "burger king",
    "דומינוס", "פיצה האט", "kfc",
    "wolt", "וולט", "japanika", "ג'פניקה", "ten bis", "תן ביס",
    "cibus", "סיבוס", "משלוחה",
    "סושי", "נגיסה", "אדו", "נודה",
    "פאב", "בר", "מייק פלייס", "מולי בלום",
    "סינמה", "קולנוע", "yes planet", "סינמה סיטי",
    "הופעה", "הצגה", "תיאטרון", "הבימה", "קאמרי",
  ],
  categoryKeys: ["dining_out"],
};

const SHOPPING_VAR: SubCategory = {
  key: "shopping_var",
  label: "קניות וביגוד",
  icon: "storefront",
  bucket: "variable",
  keywords: [
    // ── Home ──
    "איקאה", "הום סנטר", "ace", "הום דיפו", "כיתן", "מילגם",
    // ── Fashion ──
    "זארה", "h&m", "fox", "גולף", "קסטרו", "אמריקן איגל",
    "מנגו", "טרמינל x", "פולו", "pull&bear", "bershka",
    "עדיקה", "הודיס", "נעלי", "ביגוד",
    // ── Online ──
    "אליאקספרס", "aliexpress", "amazon", "shein", "שיין",
    "ebay", "iherb", "asos",
    // ── Department / general ──
    "המשביר לצרכן", "המשביר", "קניון",
    // ── Electronics ──
    "באג", "bug", "אייבורי", "ivory", "ksp",
    // ── Books / toys ──
    "שטיימצקי", "steimatzky", "צעצועים", "לגו",
    // ── Beauty ──
    "סדרה", "sabon", "סבון", "לאוקסיטן", "kiko", "מאק",
    // ── Sport goods ──
    "דקטלון", "decathlon", "אינטרספורט",
  ],
  categoryKeys: ["shopping"],
};

const HEALTH_VAR: SubCategory = {
  key: "health_var",
  label: "בריאות משתנה",
  icon: "local_hospital",
  bucket: "variable",
  keywords: [
    "מכבי", "כללית", "מאוחדת", "לאומית",
    "בית מרקחת", "רפואה", "רופא", "בית חולים", "מרפאה",
    "שיניים", "אופטיקה", "עיניים", "טיפול", "תרופות",
    "פיזיותרפיה", "פסיכולוג", "דיאטנית", "קלינאית",
    "איכילוב", "שיבא", "הדסה", "סורוקה", "אסף הרופא",
    "רמב\"ם", "וולפסון", "בלינסון", "שניידר", "מאיר",
    // סופר-פארם belongs to health, not grocery
    "סופר-פארם", "סופר פארם", "super pharm", "פארם",
    "good pharm",
  ],
  categoryKeys: ["health"],
};

const CASH_VAR: SubCategory = {
  key: "cash_var",
  label: "מזומן",
  icon: "local_atm",
  bucket: "variable",
  keywords: ["משיכת מזומן", "כספומט", "atm", "משיכה"],
  categoryKeys: ["cash"],
};

const REFUNDS_VAR: SubCategory = {
  key: "refunds_var",
  label: "זיכויים",
  icon: "currency_exchange",
  bucket: "variable",
  keywords: ["זיכוי", "החזר", "refund", "ביטול עסקה", "החזר כספי"],
  categoryKeys: ["refunds"],
};

/* ─────────────── All Sub-categories ─────────────── */

export const SUB_CATEGORIES: SubCategory[] = [
  // Fixed
  HOUSING, HOME_BILLS, TELECOM, INSURANCE, EDU_FIXED, PENSION_FIXED, FEES_FIXED,
  // Variable
  GROCERY, TRANSPORT_VAR, DINING, DINING_OUT_VAR, SHOPPING_VAR, HEALTH_VAR, CASH_VAR, REFUNDS_VAR,
];

/** Sub-categories grouped by bucket */
export const SUB_CATEGORIES_BY_BUCKET: Record<string, SubCategory[]> = {};
for (const sc of SUB_CATEGORIES) {
  if (!SUB_CATEGORIES_BY_BUCKET[sc.bucket]) SUB_CATEGORIES_BY_BUCKET[sc.bucket] = [];
  SUB_CATEGORIES_BY_BUCKET[sc.bucket].push(sc);
}

import { scopedKey } from "../client-scope";

/** Persistent user sub-category rules key */
const SUB_RULES_KEY = "verdant:sub_category_rules";

export interface SubCategoryRule {
  pattern: string;        // lowercase description substring
  subCategoryKey: string; // target sub-category key
  count: number;
}

/** Load persistent sub-category rules */
export function loadSubRules(): SubCategoryRule[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scopedKey(SUB_RULES_KEY)) || "[]"); }
  catch { return []; }
}

/** Save a persistent sub-category rule */
export function learnSubRule(description: string, subCategoryKey: string) {
  const rules = loadSubRules();
  const pattern = description.toLowerCase().replace(/["\u200F\u200E]/g, "").trim()
    .replace(/\s*(סניף|branch|#|מס['\u0027]?|snif)\s*\d+.*$/i, "")
    .replace(/\s*\d{3,}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (pattern.length < 2) return;

  const existing = rules.find(r => r.pattern === pattern && r.subCategoryKey === subCategoryKey);
  if (existing) {
    existing.count++;
  } else {
    const oldIdx = rules.findIndex(r => r.pattern === pattern);
    if (oldIdx >= 0) rules.splice(oldIdx, 1);
    rules.push({ pattern, subCategoryKey, count: 1 });
  }

  if (rules.length > 300) {
    rules.sort((a, b) => b.count - a.count);
    rules.length = 300;
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(scopedKey(SUB_RULES_KEY), JSON.stringify(rules));
  }
}

/**
 * Auto-assign a transaction to a sub-category.
 * Priority: 1) persistent user rules, 2) keyword match, 3) category-key default, 4) null
 */
export function assignSubCategory(
  categoryKey: string,
  description: string,
  bucket: string,
): SubCategory | null {
  const lower = description.toLowerCase().replace(/["\u200F\u200E]/g, "");
  const bucketSubs = SUB_CATEGORIES_BY_BUCKET[bucket];
  if (!bucketSubs || bucketSubs.length === 0) return null;

  // 1. Persistent user rules
  const rules = loadSubRules();
  const sortedRules = [...rules].sort((a, b) => b.pattern.length - a.pattern.length || b.count - a.count);
  for (const rule of sortedRules) {
    if (lower.includes(rule.pattern)) {
      const sc = bucketSubs.find(s => s.key === rule.subCategoryKey);
      if (sc) return sc;
    }
  }

  // 2. Keyword match (longest match wins)
  let bestMatch: SubCategory | null = null;
  let bestLen = 0;
  for (const sc of bucketSubs) {
    for (const kw of sc.keywords) {
      const kwLow = kw.toLowerCase();
      if (lower.includes(kwLow) && kwLow.length > bestLen) {
        bestLen = kwLow.length;
        bestMatch = sc;
      }
    }
  }
  if (bestMatch) return bestMatch;

  // 3. Category-key default
  for (const sc of bucketSubs) {
    if (sc.categoryKeys.includes(categoryKey)) return sc;
  }

  return null;
}
