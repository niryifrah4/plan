/**
 * ═══════════════════════════════════════════════════════════
 *  Risk Management Store — ניהול סיכונים
 * ═══════════════════════════════════════════════════════════
 *
 * Checklist-based risk coverage tracking.
 * 6 categories based on BDO financial-planning methodology:
 *   1. פטירה (Life insurance)
 *   2. נכות / אובדן כושר עבודה (Disability)
 *   3. סיעוד (Nursing care)
 *   4. בריאות (Health)
 *   5. מחלות קשות (Critical illness)
 *   6. רכוש ואחריות (Property & liability)
 *
 * localStorage key: verdant:risk_items
 */

import { scopedKey } from "./client-scope";

import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:risk_items";
const BLOB_KEY = "risk_items";
export const RISK_EVENT = "verdant:risk:updated";

/* ── Category definitions ── */

export interface RiskCategory {
  key: string;
  label: string;
  icon: string;
  description: string;
}

export const RISK_CATEGORIES: RiskCategory[] = [
  { key: "death",      label: "פטירה — ביטוח חיים",          icon: "favorite",           description: "כיסוי למקרה פטירה — הגנה על המשפחה" },
  { key: "disability", label: "נכות / אובדן כושר עבודה",    icon: "accessible",          description: "הבטחת הכנסה במקרה של אי-יכולת לעבוד" },
  { key: "nursing",    label: "סיעוד",                       icon: "elderly",             description: "כיסוי למקרה סיעוד — ביטוח פרטי וקופת חולים" },
  { key: "health",     label: "בריאות",                      icon: "local_hospital",      description: "ביטוח בריאות פרטי, השלמת שב\"ן, טכנולוגיות" },
  { key: "critical",   label: "מחלות קשות",                  icon: "emergency",           description: "כיסוי חד-פעמי למקרה אבחון מחלה קשה" },
  { key: "property",   label: "רכוש ואחריות",                icon: "home_work",           description: "ביטוח דירה, רכב, אחריות מקצועית, שותפים" },
  // 2026-04-29 per Nir: legal docs are part of risk management — "אם אין
  // צוואה / הסכם ממון, לערוך". Drives questionnaire follow-up tasks.
  { key: "legal",      label: "תכנון משפטי",                  icon: "gavel",               description: "צוואה, הסכם ממון, ייפוי כוח מתמשך" },
];

/* ── Risk item (one checklist row) ── */

export type CoverageStatus = "covered" | "partial" | "missing" | "not_relevant";

export interface RiskItem {
  id: string;
  category: string;           // key from RISK_CATEGORIES
  label: string;              // "ביטוח חיים דרך פנסיה"
  description?: string;       // פירוט נוסף
  status: CoverageStatus;
  coverageAmount?: number;    // סכום כיסוי ₪
  monthlyCost?: number;       // עלות חודשית ₪
  provider?: string;          // חברת ביטוח / קרן
  policyNumber?: string;      // מספר פוליסה
  expiryDate?: string;        // תוקף (YYYY-MM)
  notes?: string;
  sortOrder: number;
}

/* ── Default checklist template ── */

let _id = 0;
const item = (
  category: string,
  label: string,
  description?: string,
): RiskItem => ({
  id: `risk_default_${++_id}`,
  category,
  label,
  description,
  status: "missing",
  sortOrder: _id,
});

export const DEFAULT_RISK_ITEMS: RiskItem[] = [
  // פטירה
  item("death", "ביטוח חיים דרך קרן פנסיה", "כיסוי מוות שמגיע כחלק מקרן הפנסיה"),
  item("death", "ביטוח חיים פרטי (ריסק)", "פוליסת ריסק נפרדת"),
  item("death", "ביטוח חיים דרך משכנתא", "ביטוח ריסק למשכנתא"),
  item("death", "קצבת שאירים (ביטוח לאומי)", "זכאות לקצבת שאירים"),
  // נכות
  item("disability", "אובדן כושר עבודה דרך פנסיה", "כיסוי 75% מהשכר המבוטח"),
  item("disability", "אובדן כושר עבודה פרטי", "פוליסה עצמאית — כיסוי עיסוקי"),
  item("disability", "ביטוח נכות מתאונה", "כיסוי חד-פעמי למקרה נכות"),
  // סיעוד
  item("nursing", "ביטוח סיעודי דרך קרן פנסיה", "כיסוי סיעודי המגיע כחלק מהפנסיה"),
  item("nursing", "ביטוח סיעודי דרך קופת חולים", "שב\"ן סיעודי"),
  item("nursing", "ביטוח סיעודי פרטי", "פוליסה פרטית לסיעוד"),
  // בריאות
  item("health", "ביטוח בריאות פרטי", "פוליסה פרטית — ניתוחים, מומחים"),
  item("health", "השלמת שב\"ן (קופת חולים)", "שירותי בריאות נוספים"),
  item("health", "ביטוח שיניים", "כיסוי טיפולי שיניים"),
  item("health", "ביטוח תרופות / טכנולוגיות מתקדמות", "כיסוי לתרופות שלא בסל"),
  // מחלות קשות
  item("critical", "ביטוח מחלות קשות — מבוטח ראשי", "סכום חד-פעמי במקרה אבחון"),
  item("critical", "ביטוח מחלות קשות — בן/בת זוג", "כיסוי לבן/בת הזוג"),
  item("critical", "ביטוח מחלות קשות — ילדים", "כיסוי לילדים"),
  // רכוש ואחריות
  item("property", "ביטוח דירה — מבנה", "ביטוח שלד ומערכות"),
  item("property", "ביטוח דירה — תכולה", "ביטוח רכוש בדירה"),
  item("property", "ביטוח צד ג׳ (אחריות)", "כיסוי נזקי צד שלישי"),
  item("property", "ביטוח רכב — חובה + מקיף", "ביטוח חובה וביטוח מקיף"),
  item("property", "ביטוח אחריות מקצועית", "למי שעוסק בייעוץ/שירות מקצועי"),
  item("property", "ביטוח שותפים / אנשי מפתח", "ביטוח עסקי — שותפים ואנשי מפתח"),
  // תכנון משפטי — נטען / מתעדכן אוטומטית מהשאלון.
  item("legal", "צוואה", "מסמך משפטי שמגדיר את חלוקת הרכוש לאחר פטירה"),
  item("legal", "הסכם ממון", "הסכם בין בני הזוג לחלוקת רכוש במקרה גירושין"),
  item("legal", "ייפוי כוח מתמשך", "מסמך שממנה אדם לטפל בעניינים במקרה אובדן כשרות משפטית"),
];

/* ── CRUD ── */

export function loadRiskItems(): RiskItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // 2026-04-29 migration: ensure default "legal" items exist for users
        // who saved risk items before that category was introduced. Adds only
        // missing-by-label rows; never overwrites existing data.
        const labels = new Set(parsed.map((i: RiskItem) => i.label));
        const legalDefaults = DEFAULT_RISK_ITEMS.filter(
          d => d.category === "legal" && !labels.has(d.label),
        );
        if (legalDefaults.length > 0) {
          const augmented = [...parsed, ...legalDefaults.map(d => ({ ...d, id: `risk_legal_${Date.now()}_${d.label}` }))];
          // Persist quietly so next load is consistent.
          try { localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(augmented)); } catch {}
          return augmented;
        }
        return parsed;  // empty array = valid user state
      }
    }
  } catch {}
  // No data saved yet — seed with defaults (first visit only).
  return DEFAULT_RISK_ITEMS.map(i => ({ ...i }));
}

export function saveRiskItems(items: RiskItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(items));
  window.dispatchEvent(new Event(RISK_EVENT));
  pushBlobInBackground(BLOB_KEY, items);
}

export async function hydrateRiskFromRemote(): Promise<boolean> {
  const remote = await pullBlob<RiskItem[]>(BLOB_KEY);
  if (!remote || !Array.isArray(remote)) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(RISK_EVENT));
    return true;
  } catch { return false; }
}

export function updateRiskItem(id: string, patch: Partial<RiskItem>) {
  const items = loadRiskItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...patch };
  saveRiskItems(items);
}

export function addRiskItem(newItem: RiskItem) {
  const items = loadRiskItems();
  items.push(newItem);
  saveRiskItems(items);
}

export function deleteRiskItem(id: string) {
  saveRiskItems(loadRiskItems().filter(i => i.id !== id));
}

export function resetToDefaults() {
  saveRiskItems([...DEFAULT_RISK_ITEMS]);
}

/* ── Stats helpers ── */

export interface RiskStats {
  total: number;
  covered: number;
  partial: number;
  missing: number;
  notRelevant: number;
  coveragePct: number;        // (covered + partial*0.5) / relevant
  totalMonthlyCost: number;
}

export function computeRiskStats(items: RiskItem[]): RiskStats {
  const relevant = items.filter(i => i.status !== "not_relevant");
  const covered = items.filter(i => i.status === "covered").length;
  const partial = items.filter(i => i.status === "partial").length;
  const missing = items.filter(i => i.status === "missing").length;
  const notRelevant = items.filter(i => i.status === "not_relevant").length;
  const relevantCount = relevant.length || 1;
  const coveragePct = (covered + partial * 0.5) / relevantCount;
  const totalMonthlyCost = items.reduce((s, i) => s + (i.monthlyCost || 0), 0);

  return { total: items.length, covered, partial, missing, notRelevant, coveragePct, totalMonthlyCost };
}

export function getCategoryStats(items: RiskItem[], categoryKey: string): RiskStats {
  return computeRiskStats(items.filter(i => i.category === categoryKey));
}
