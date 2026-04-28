/**
 * Auto-Categorizer v3 — Israeli Transaction Classifier (Comprehensive)
 * Longest-match-wins, regex patterns, user overrides (persistent ML).
 *
 * Coverage: 500+ Israeli merchants, chains, utilities, institutions.
 */

export interface Category {
  key: string;
  label: string;
  icon: string;
  color: string;
  keywords: string[];
  patterns?: RegExp[];
}

export const CATEGORIES: Category[] = [
  {
    key: "food",
    label: "מזון וצריכה",
    icon: "shopping_cart",
    color: "#2B694D",
    keywords: [
      // ── Supermarket chains ──
      "שופרסל", "רמי לוי", "מגה", "מגה בעיר", "מגה בול",
      "יוחננוף", "חצי חינם", "אושר עד", "טיב טעם",
      "ויקטורי", "סופר סול", "פרש מרקט", "סופר ברקת",
      "זול ובגדול", "מחסני השוק", "סופר דוש", "קינג סטור",
      "שוק", "מכולת", "ירקות", "פירות",
      // ── Convenience ──
      "am:pm", "yellow", "נעמן", "כל בו",
      // ── Producers / wholesale ──
      "תנובה", "טרה", "שטראוס", "אסם", "עלית",
      // ── Bakeries ──
      "מאפייה", "לחם ארז", "אנגלס", "רולדין", "פת בגליל",
      "לחמנינה", "בייגל",
      // ── Online grocery ──
      "משלוח שופרסל", "רמי לוי אונליין",
      // ── Markets ──
      "שוק הכרמל", "שוק מחנה יהודה",
      // Note: delivery apps (wolt, ten bis, cibus) → dining_out category
      // Note: סופר-פארם / pharmacy moved to "health" category
      // ── Cleaning / household ──
      "ניקיון", "מרקחת",
    ],
    patterns: [
      /סופר(?!\s*פארם)(?!\-פארם)/i,
    ],
  },
  {
    key: "housing",
    label: "דיור ומגורים",
    icon: "home",
    color: "#1B4332",
    keywords: [
      "משכנתא", "שכירות", "שכ\"ד", "ארנונה", "ועד בית", "ועד הבית",
      "בנק אדנים", "עמידר", "דירה", "שיפוץ", "קבלן",
      "מי אביבים", "מי שבע", "מקורות מים", "גיחון", "מי כרמל",
      "מי דן", "מי עפולה", "מי רמת גן",
      "חברת חשמל", "חב' חשמל", "iec", "israel electric",
      "גז", "אמישראגז", "סופרגז", "פזגז",
    ],
  },
  {
    key: "transport",
    label: "תחבורה ורכב",
    icon: "directions_car",
    color: "#3b82f6",
    keywords: [
      // ── Gas stations ──
      "פז", "דלק", "סונול", "דור אלון", "ten", "אלון",
      "דלק אנרגיה", "תעם+",
      // ── Parking ──
      "חניה", "חניון", "פנגו", "סלופארק", "cellopark",
      // ── Public transport ──
      "אגד", "דן", "רכבת ישראל", "רכבת", "קו קווים", "מטרופולין",
      "רב קו", "rav kav", "תחבורה ציבורית", "נתיבי איילון",
      // ── Taxis / ride-sharing ──
      "מונית", "gett", "גט טקסי", "yango", "יאנגו", "uber",
      // ── Vehicle ──
      "טסט", "רישוי", "אגרת רישוי", "ביטוח רכב",
      "מוסך", "צמיגים", "שמן מנוע", "שטיפת רכב",
      // ── Car rental / sharing ──
      "אלדן", "שלמה סיקסט", "hertz", "avis", "budget", "car2go",
      "אוטותל", "סיקסט",
      // ── E-scooters / bikes ──
      "ליים", "lime", "bird", "wind",
      // ── Tolls ──
      "כביש 6", "כביש 6 חוצה", "דרך ארץ",
    ],
    patterns: [
      /תדלוק|דלק\s/i,
      /חני(ה|ון)\s/i,
    ],
  },
  {
    key: "utilities",
    label: "חשבונות שוטפים",
    icon: "bolt",
    color: "#f59e0b",
    keywords: [
      "חשמל", "מקורות", "מים", "גז", "עיריית", "עירייה",
      "בזק", "פרטנר", "סלקום", "הוט", "cellcom",
      "012", "013", "bezeq", "hot net", "הוט מובייל",
      "yes", "אינטרנט", "סלולר",
      "גולן טלקום", "פלאפון", "012 mobile",
      "we4g", "רמי לוי תקשורת", "הוט מובייל", "019",
      "xfone", "אקספון", "youphone",
    ],
    patterns: [
      /מי\s*(אביבים|שבע|גיחון|כרמל|עפולה|דן|רמת\s*גן)/i,
    ],
  },
  {
    key: "health",
    label: "בריאות",
    icon: "local_hospital",
    color: "#ef4444",
    keywords: [
      // ── Health funds ──
      "מכבי", "כללית", "מאוחדת", "לאומית",
      // ── Pharmacy ──
      "סופר-פארם", "סופר פארם", "super pharm", "super-pharm",
      "good pharm", "פארם", "בית מרקחת",
      // ── Medical ──
      "רפואה", "רופא", "בית חולים", "מרפאה", "רמב\"ם",
      "איכילוב", "שיבא", "הדסה", "סורוקה", "אסף הרופא",
      "שניידר", "וולפסון", "בלינסון", "מאיר",
      // ── Specific treatments ──
      "שיניים", "אופטיקה", "עיניים", "טיפול", "תרופות",
      "פיזיותרפיה", "פסיכולוג", "דיאטנית", "קלינאית",
    ],
  },
  {
    key: "education",
    label: "חינוך וילדים",
    icon: "school",
    color: "#2B694D",
    keywords: [
      "גן ילדים", "גן", "בית ספר", "חוג", "שיעור",
      "אוניברסיטה", "מכללה", "קורס", "תלמוד",
      "צהרון", "קייטנה", "שכר לימוד", "הרשמה",
      "מעון", "טרום חובה", "מכינה", "בחינה",
      // ── Music / arts ──
      "שיעורי מוזיקה", "קונסרבטוריון", "חוג ציור",
      // ── Driving ──
      "שיעורי נהיגה", "בית ספר לנהיגה",
    ],
  },
  {
    key: "insurance",
    label: "ביטוח",
    icon: "shield",
    color: "#06b6d4",
    keywords: [
      "ביטוח", "מגדל", "הראל", "כלל ביטוח", "הפניקס", "מנורה",
      "איילון", "שלמה ביטוח", "ביטוח לאומי",
      "מגדל ביטוח", "הראל ביטוח", "הפניקס ביטוח",
      "ביטוח בריאות", "ביטוח חיים", "ביטוח דירה",
      "ביט ביטוח", "פסגות ביטוח", "שומרה",
      "ביטוח משכנתא",
    ],
  },
  {
    key: "leisure",
    label: "פנאי ובידור",
    icon: "theater_comedy",
    color: "#ec4899",
    keywords: [
      // ── Parks / outdoors ──
      "פארק", "לונה פארק", "ספארי",
      // ── Fitness ──
      "ספורט", "חדר כושר", "הולמס", "הולמס פלייס",
      "גו אקטיב", "סטודיו",
      // ── Streaming (also in subscriptions) ──
      "נטפליקס", "netflix", "ספוטיפיי", "spotify",
      "אפל מיוזיק", "apple music", "דיסני", "disney",
      "hbo", "אמזון פריים", "amazon prime",
    ],
  },
  {
    key: "shopping",
    label: "קניות",
    icon: "storefront",
    color: "#f97316",
    keywords: [
      // ── Home & furniture ──
      // NOTE: hardware / maintenance chains (הום סנטר, ace, הום דיפו)
      // moved to the "home_maintenance" category below.
      "איקאה", "ikea",
      "כיתן", "ריהוט", "מילגם",
      // ── Fashion ──
      "זארה", "h&m", "fox", "גולף", "קסטרו",
      "אמריקן איגל", "מנגו", "טרמינל x",
      "פולו", "pull&bear", "bershka", "עדיקה",
      "הודיס", "נעמן", "נעלי",
      // ── Online ──
      "אליאקספרס", "amazon", "shein", "שיין", "aliexpress",
      "ebay", "iherb", "asos",
      // ── Department stores ──
      "המשביר לצרכן", "המשביר",
      // ── Electronics ──
      "באג", "bug", "אייבורי", "ivory", "ksp", "מחשבים",
      "זאפ", "דיגיטל", "apple store", "אפל סטור",
      "סמסונג", "samsung", "מעבדה",
      // ── Books / toys / gifts ──
      "שטיימצקי", "steimatzky", "צעצועים", "לגו",
      "פרחים", "מתנה", "מתנות",
      // ── Beauty / cosmetics ──
      "סדרה", "sabon", "סבון", "לאוקסיטן", "kiko",
      "מאק", "mac cosmetics",
      // ── Sporting goods ──
      "דקטלון", "decathlon", "אינטרספורט",
      // ── Pet shops ──
      "חנות חיות", "פט שופ",
    ],
  },
  {
    key: "salary",
    label: "משכורת",
    icon: "payments",
    color: "#2B694D",
    keywords: [
      "משכורת", "שכר", "העברה ממעסיק", "מעביד",
      "שכר חודש", "שכר עבודה", "נטו", "ברוטו",
      "שכר דירקטורים", "דמי ניהול", "תשלום עבור שירותים",
      "הכנסה משכירות", "דמי שכירות", "שכ\"ד מקבל",
      "קצבת ילדים", "ביטוח לאומי קצבה", "קצבת זקנה",
      "מענק עבודה", "מענק לידה", "מלגה",
      "דיבידנד", "ריבית זכות", "הכנסה מריבית",
      "פרילנס", "חשבונית", "הכנסות",
    ],
    patterns: [
      /משכ(ורת|ו׳|\.)/i,
      /שכר\s*(חודש|עבודה)/i,
      /העברה\s*(ממעסיק|מחברת|מעובד)/i,
      /קצבת?\s*(ילדים|זקנה|נכות|שאירים)/i,
      /מענק\s*(עבודה|לידה|הסתגלות)/i,
    ],
  },
  {
    key: "pension",
    label: "פנסיה וחיסכון",
    icon: "savings",
    color: "#1a6b42",
    keywords: [
      "פנסיה", "גמל", "השתלמות", "הפרשה", "פיצויים",
      "מיטב דש", "אלטשולר", "מור", "פסגות",
      "מנורה פנסיה", "הראל פנסיה", "מגדל פנסיה",
      "קרן פנסיה", "קרן השתלמות", "קופת גמל",
    ],
  },
  {
    key: "transfers",
    label: "העברות",
    icon: "swap_horiz",
    color: "#64748b",
    keywords: [
      "העברה", "העב\"ב", "בית לבית", "ביט", "bit", "paybox", "פפר",
      "pepper", "העברת זהב", "העברה בין חשבונות",
      "שק", "צ'ק", "שיק", "המחאה",
      "פיקדון", "פק\"מ", "פקדון",
      "חיסכון", "הפקדה לחיסכון",
      // 2026-04-28: explicit children-savings keywords. These are
      // government deposits + parental match flowing to a kid's account
      // (₪57 + ₪57 = ₪114). Money leaves the parent's account but is NOT
      // an expense — it's a transfer to an asset.
      "חיסכון לכל ילד", "חיסכון לילד", "חיסכון לילדים",
      "מגדל גמל ילדים", "פסגות ילדים", "אלטשולר ילדים",
      "ילין לפידות ילדים", "מיטב גמל ילדים",
    ],
    patterns: [
      /העברה?\s*(ל|מ|בין)/i,
      /שק\s*מס[\'\u0027]?\s*\d+/i,
      /צ['\u0027]?ק\s*\d+/i,
    ],
  },
  {
    key: "cash",
    label: "מזומן",
    icon: "local_atm",
    color: "#78716c",
    keywords: [
      "משיכת מזומן", "כספומט", "atm", "משיכה", "מזומן",
      "cash", "cashback",
    ],
    patterns: [
      /משיכת?\s*מזומן/i,
      /atm\s/i,
      /כספומט/i,
    ],
  },
  {
    key: "subscriptions",
    label: "מנויים",
    icon: "loyalty",
    color: "#2B694D",
    keywords: [
      "מנוי", "חודשי",
      // ── SaaS & tech ──
      "google storage", "google one", "icloud",
      "dropbox", "zoom", "microsoft 365", "canva",
      "adobe", "chatgpt", "openai", "figma", "notion",
      "monday.com", "slack", "github",
    ],
  },
  {
    key: "refunds",
    label: "זיכויים באשראי",
    icon: "currency_exchange",
    color: "#059669",
    keywords: [
      "זיכוי", "החזר", "refund", "credit", "ביטול עסקה",
      "החזר כספי", "זיכוי אשראי",
    ],
    patterns: [
      /זיכוי\s*(מ|של|עבור|בגין)/i,
      /החזר\s*(כספי|תשלום|עסקה)/i,
    ],
  },
  {
    key: "fees",
    label: "עמלות וריביות",
    icon: "receipt_long",
    color: "#dc2626",
    keywords: [
      "עמלה", "דמי כרטיס", "ריבית", "דמי ניהול חשבון",
      "דמי ניהול", "עמלת פעולה", "דמי שימוש", "עמלת המרה",
      "עמלת העברה", "דמי חיוב", "ריבית חובה", "ריבית פיגורים",
      "עמלת כרטיס", "דמי כספומט", "עמלת בנק",
      "עמלת מט\"ח", "עמלת ני\"ע", "עמלת ניירות ערך",
      "דמי נאמנות", "דמי משמרת", "עמלת דף חשבון",
      "commission", "bank fee", "interest",
    ],
    patterns: [
      /עמל(ה|ת)\s/i,
      /דמי\s*(ניהול|כרטיס|שימוש|חיוב)/i,
      /ריבית\s*(חובה|פיגורים|שנתית|חודשית)?/i,
    ],
  },
  {
    key: "dining_out",
    label: "אוכל בחוץ ובילויים",
    icon: "restaurant",
    color: "#e11d48",
    keywords: [
      // ── Restaurants & cafés ──
      "מסעדה", "קפה", "בית קפה", "ארומה", "קופי",
      "קפה הלל", "קפה אורבן", "ברסטה", "קפה גרג",
      "קפה לנדוור", "קפה קפה", "coffee bean",
      // ── Fast food ──
      "מקדונלדס", "mcdonald", "בורגר קינג", "burger king",
      "דומינוס", "פיצה האט", "kfc",
      // ── Delivery ──
      "wolt", "וולט", "japanika", "ג'פניקה", "ten bis", "תן ביס",
      "cibus", "סיבוס", "משלוחה",
      // ── Asian / sushi ──
      "סושי", "נגיסה", "אדו", "נודה",
      // ── Israeli chains ──
      "אגדיר", "שפונדי", "גוטה", "בנדיקט", "מושבוצ",
      "הבשר של ענת", "מחניודה", "נלה", "אנסטסיה",
      // ── Bars ──
      "פאב", "בר", "מייק פלייס", "מולי בלום",
      // ── Entertainment ──
      "סינמה", "קולנוע", "yes planet", "סינמה סיטי",
      "הופעה", "הצגה", "תיאטרון", "הבימה", "קאמרי",
      "לב תל אביב", "ראשון סנטר", "קניון",
      // ── Ice cream / sweets ──
      "גלידה", "גולדה", "אנריקו", "ביסקוטי",
    ],
    patterns: [
      /מסע(דה|דת)/i,
      /בית\s*קפה/i,
      /פיצ(ה|ריה)/i,
    ],
  },
  {
    key: "home_maintenance",
    label: "תחזוקת בית",
    icon: "handyman",
    color: "#0e7490",
    keywords: [
      // ── Hardware / DIY stores ──
      "הום סנטר", "home center", "ace", "ace hardware", "הום דיפו", "home depot",
      "מחסני חשמל", "מחסני", "וולהשופ",
      // ── Trades & repairs ──
      "שרברב", "אינסטלטור", "חשמלאי", "טכנאי",
      "טכנאי מזגנים", "טכנאי כביסה", "טכנאי מקרר", "טכנאי תנור",
      "תיקון", "תיקונים", "שיפוץ", "שיפוצים", "קבלן שיפוצים",
      "הדברה", "ניקיון", "ניקוי", "ניקוי ספות", "ניקוי שטיחים",
      "פוליש", "פוליש רצפות",
      // ── Home goods & materials ──
      "צבע", "צבעי", "צביעה", "טמבור", "נירלט",
      "אריחים", "קרמיקה", "פורמייקה", "פרקט",
      "אבן קיסר", "מטבחים", "גרניט",
      // ── Appliance service & parts ──
      "אלקטרה", "טורנדו", "סהר", "דוד שמש",
      "תחזוקה", "תחזוקת", "אחזקה",
      // ── Gardening ──
      "גינון", "גנן", "דשא", "משתלה", "משתלת",
    ],
    patterns: [
      /שרברב|אינסטלטור|חשמלאי/i,
      /תיקון\s*(מזגן|מקרר|תנור|כביסה|מייבש|דוד)/i,
      /טכנאי\s*\S+/i,
      /שיפוצ(ים|ים)?/i,
    ],
  },
  {
    // Explicit user-selectable "miscellaneous" — distinct from "other" (which
    // is the auto-fallback for unrecognized merchants). Items tagged "misc"
    // have been manually acknowledged by the user as "known but non-specific".
    // No auto-keywords: the categorizer never auto-assigns this — only the user.
    key: "misc",
    label: "שונות",
    icon: "category",
    color: "#64748b",
    keywords: [],
  },
];

/* ──────── User Override Storage (Persistent ML) ──────── */
import { scopedKey } from "../client-scope";

const OVERRIDES_KEY = "verdant:category_overrides";

export interface CategoryOverride {
  pattern: string;
  category: string;
  count: number;
}

function loadOverrides(): CategoryOverride[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scopedKey(OVERRIDES_KEY)) || "[]"); }
  catch { return []; }
}

/**
 * Save user override — extracts merchant root for lateral learning.
 * "שופרסל סניף 42" → root "שופרסל" → learns for ALL שופרסל.
 */
export function learnOverride(description: string, categoryKey: string) {
  const overrides = loadOverrides();
  const fullPattern = description.toLowerCase().replace(/["\u200F\u200E]/g, "").trim();

  const root = fullPattern
    .replace(/\s*(סניף|branch|#|מס['\u0027]?|snif)\s*\d+.*$/i, "")
    .replace(/\s*\d{3,}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const patternsToLearn = [fullPattern];
  if (root && root !== fullPattern && root.length >= 3) {
    patternsToLearn.push(root);
  }

  for (const pattern of patternsToLearn) {
    const existing = overrides.find(o => o.pattern === pattern && o.category === categoryKey);
    if (existing) {
      existing.count++;
    } else {
      const oldIdx = overrides.findIndex(o => o.pattern === pattern);
      if (oldIdx >= 0) overrides.splice(oldIdx, 1);
      overrides.push({ pattern, category: categoryKey, count: 1 });
    }
  }

  if (overrides.length > 500) {
    overrides.sort((a, b) => b.count - a.count);
    overrides.length = 500;
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(scopedKey(OVERRIDES_KEY), JSON.stringify(overrides));
  }
}

/**
 * Find all transactions matching a description root (lateral learning).
 */
export function findSimilarIndices(transactions: { description: string }[], changedIdx: number): number[] {
  const desc = transactions[changedIdx]?.description;
  if (!desc) return [changedIdx];

  const root = desc.toLowerCase().replace(/["\u200F\u200E]/g, "").trim()
    .replace(/\s*(סניף|branch|#|מס['\u0027]?|snif)\s*\d+.*$/i, "")
    .replace(/\s*\d{3,}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (root.length < 3) return [changedIdx];

  const indices: number[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const other = transactions[i].description.toLowerCase().replace(/["\u200F\u200E]/g, "").trim();
    if (other.includes(root) || root.includes(other.substring(0, root.length))) {
      indices.push(i);
    }
  }
  return indices;
}

export function getOverrides(): CategoryOverride[] {
  return loadOverrides();
}

/**
 * Classify a transaction description into a category.
 * Priority: 1) user overrides (ML), 2) longest keyword match, 3) regex patterns, 4) "other"
 */
export function categorize(description: string): { key: string; label: string; confidence: number } {
  const lower = description.toLowerCase().replace(/["\u200F\u200E]/g, "");

  // Strip common Israeli bank prefixes that hide the actual merchant
  const stripped = lower
    .replace(/^הוראת?\s*קבע\s*(ל|מ|עבור)?\s*/i, "")
    .replace(/^הו"?ק\s*/i, "")            // הו"ק = הוראת קבע abbreviation
    .replace(/^מס"?ב\s*/i, "")
    .replace(/^ה[\.']?ק\s*/i, "")         // ה.ק = הוראת קבע abbreviation
    .replace(/^חיוב\s*אשראי\s*/i, "")
    .replace(/^תשלום\s*(ל|מ|עבור)?\s*/i, "")
    .replace(/^הפקדת?\s*(ל|מ)?\s*/i, "")
    .replace(/^משיכת?\s*/i, "")           // "משיכה" prefix in Discount bank
    .replace(/^העברת?\s*(ב|ל|מ)?\s*/i, "")
    .trim();

  // Check both original and stripped versions
  const searchTexts = stripped !== lower ? [lower, stripped] : [lower];

  // 1. User overrides (ML) — longest pattern first
  const overrides = loadOverrides();
  const sorted = [...overrides].sort((a, b) => b.pattern.length - a.pattern.length || b.count - a.count);
  for (const ov of sorted) {
    for (const text of searchTexts) {
      if (text.includes(ov.pattern)) {
        const cat = CATEGORIES.find(c => c.key === ov.category);
        if (cat) return { key: cat.key, label: cat.label, confidence: 1.0 };
      }
    }
  }

  // 2. Longest keyword match
  let bestCat: { key: string; label: string } | null = null;
  let bestLen = 0;

  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      const kwLow = kw.toLowerCase();
      for (const text of searchTexts) {
        if (text.includes(kwLow) && kwLow.length > bestLen) {
          bestLen = kwLow.length;
          bestCat = { key: cat.key, label: cat.label };
        }
      }
    }
  }

  if (bestCat) {
    // confidence: longer keyword → higher. ≥6 chars = 0.9, shorter = 0.7.
    const conf = bestLen >= 6 ? 0.9 : 0.7;
    return { ...bestCat, confidence: conf };
  }

  // 3. Regex patterns
  for (const cat of CATEGORIES) {
    if (cat.patterns) {
      for (const rx of cat.patterns) {
        for (const text of searchTexts) {
          if (rx.test(text)) {
            return { key: cat.key, label: cat.label, confidence: 0.5 };
          }
        }
      }
    }
  }

  return { key: "other", label: "אחר", confidence: 0 };
}

export function getCategoryByKey(key: string): Category | undefined {
  return CATEGORIES.find(c => c.key === key);
}
