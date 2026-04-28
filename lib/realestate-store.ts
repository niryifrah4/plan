/**
 * ═══════════════════════════════════════════════════════════
 *  Real Estate Property Store — CRUD + Onboarding Migration
 * ═══════════════════════════════════════════════════════════
 *
 * localStorage key: verdant:realestate_properties
 * Cross-tab sync via custom event + storage event.
 *
 * On first load, migrates real-estate assets from the onboarding
 * questionnaire (verdant:onboarding:assets) so users see their
 * properties immediately without re-entering data.
 */

import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:realestate_properties";
const ONBOARDING_ASSETS_KEY = "verdant:onboarding:assets";
const EVENT_NAME = "verdant:realestate:updated";
const BLOB_KEY = "realestate_properties";

export interface Property {
  id: string;
  name: string;                    // "דירת מגורים רחוב אבן גבירול 38"
  type: "residence" | "investment" | "commercial" | "land";
  address?: string;
  city?: string;
  purchaseDate?: string;           // YYYY-MM
  purchasePrice: number;           // מחיר רכישה
  currentValue: number;            // שווי נוכחי (הערכה)
  area?: number;                   // שטח במ"ר
  rooms?: number;
  monthlyRent?: number;            // שכ"ד חודשי (אם להשקעה)
  monthlyExpenses?: number;        // ועד בית, ארנונה, ביטוח, תחזוקה
  monthlyMortgage?: number;        // החזר משכנתא חודשי על הנכס הזה
  mortgageBalance?: number;        // יתרת משכנתא
  mortgageLinked?: boolean;        // האם יש משכנתא צמודה (מגיעה מ-debt store)
  annualAppreciation?: number;     // הערכת עליית ערך שנתית (ברירת מחדל 3%)
  oneTimeAppreciation?: number;    // עליית ערך חד-פעמית (שיפוץ/תמ"א) — סכום בש"ח
  oneTimeAppreciationYear?: number;// באיזו שנה תתרחש (1 = שנה ראשונה)
  holdingYears?: number;           // תכנון להחזיק בנכס כמה שנים (לצורכי IRR/יציאה)
  annualRentGrowth?: number;       // גידול שנתי של שכ״ד (ברירת מחדל: כמו annualAppreciation, בד״כ 3%)
  notes?: string;
  /**
   * 2026-04-28: Owner's primary residence ("דירה יחידה"). Drives the
   * Israeli capital-gains tax exemption logic on /realestate. Default:
   * true for type="residence" + first added property; the user can flip.
   */
  isPrimaryResidence?: boolean;
}

// ===== Migration from onboarding =====

function migrateFromOnboarding(): Property[] {
  const raw = localStorage.getItem(scopedKey(ONBOARDING_ASSETS_KEY));
  if (!raw) return [];
  try {
    const assets: { type: string; desc: string; value: string; rent?: string; rentExpenses?: string }[] = JSON.parse(raw);
    // Filter only explicit real-estate types — startsWith("נדל") prevents
    // "קופת גמל להשקעה" or other investment types from slipping through.
    return assets
      .filter(a => a.type.startsWith("נדל"))
      // Skip empty placeholder rows — the onboarding form seeds a default
      // `{ type: "נדל\"ן למגורים", desc: "", value: "" }` row so the first
      // property has something to fill. Without this filter it becomes a
      // ghost residence on the /realestate page the moment the user adds
      // their first real property.
      .filter(a => (Number(a.value) || 0) > 0 || (a.desc && a.desc.trim()))
      .map((a) => {
        const isInvestment = a.type === "נדל\"ן להשקעה";
        const rent = Number(a.rent) || 0;
        const rentExp = Number(a.rentExpenses) || 0;
        return {
          // Stable id — same format the onboarding-sync step uses. This keeps
          // both code paths (first-time migration + re-sync on autosave)
          // converging onto a single property record, so rent updates from
          // the questionnaire patch the existing row instead of duplicating.
          id: `onb_prop_${a.type}_${a.desc || ""}`,
          name: a.desc || a.type,
          // Exact match on investment real-estate — NOT substring "השקעה" which would
          // incorrectly catch "קופת גמל להשקעה".
          type: isInvestment ? "investment" as const : "residence" as const,
          purchasePrice: Number(a.value) || 0,
          currentValue: Number(a.value) || 0,
          annualAppreciation: 0.03,
          annualRentGrowth: 0.03,
          holdingYears: 10,
          ...(isInvestment && rent > 0 ? { monthlyRent: rent } : {}),
          ...(isInvestment && rentExp > 0 ? { monthlyExpenses: rentExp } : {}),
        };
      });
  } catch {
    return [];
  }
}

export function loadProperties(): Property[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
  if (!raw) {
    // First time — migrate from onboarding
    const migrated = migrateFromOnboarding();
    if (migrated.length > 0) {
      localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(migrated));
      return migrated;
    }
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveProperties(props: Property[]) {
  // Enforce primary-residence uniqueness on every save so the tax logic
  // never sees an inconsistent state.
  const safe = dedupePrimaryFlags(props);
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(safe));
  window.dispatchEvent(new Event(EVENT_NAME));
  pushBlobInBackground(BLOB_KEY, safe);
}

/** Pull properties from Supabase and overwrite local cache. */
export async function hydratePropertiesFromRemote(): Promise<boolean> {
  const remote = await pullBlob<Property[]>(BLOB_KEY);
  if (!remote || !Array.isArray(remote)) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    window.dispatchEvent(new Event(EVENT_NAME));
    return true;
  } catch {
    return false;
  }
}

export function addProperty(prop: Property) {
  const all = loadProperties();
  all.push(prop);
  saveProperties(all);
}

export function updateProperty(id: string, patch: Partial<Property>) {
  const all = loadProperties();
  const idx = all.findIndex(p => p.id === id);
  if (idx >= 0) all[idx] = { ...all[idx], ...patch };
  saveProperties(all);
}

export function deleteProperty(id: string) {
  saveProperties(loadProperties().filter(p => p.id !== id));
}

/**
 * Enforce that at most one property carries `isPrimaryResidence: true`.
 * If more than one is flagged (a state that should not exist but might
 * after a sync race), we keep the OLDEST entry and unflag the rest —
 * older usually = the actual primary the user already owned.
 */
function dedupePrimaryFlags(props: Property[]): Property[] {
  const flagged = props.filter(p => p.isPrimaryResidence);
  if (flagged.length <= 1) return props;
  // Sort by id (created order ~ insertion). Keep first; clear the rest.
  const keep = flagged[0].id;
  return props.map(p =>
    p.isPrimaryResidence && p.id !== keep
      ? { ...p, isPrimaryResidence: false }
      : p
  );
}

export { EVENT_NAME };

/**
 * Israeli capital-gains-tax (מס שבח) status for a property, given the
 * full portfolio. Implements the "single residence exemption" + the
 * 18-month overlap window for upgraders (חוק חישוב חדש 2026).
 *
 * Returns one of:
 *  - "exempt"       : single residence — no tax on sale
 *  - "overlap"      : currently within 18 months of buying a new primary,
 *                     so the second property is treated as transitional;
 *                     `monthsLeft` tells how many months remain
 *  - "taxable"      : capital gains tax applies on the realized gain
 *  - "unknown"      : missing dates — UI should ask the user to fill in
 */
export function propertyTaxStatus(prop: Property, all: Property[]): {
  status: "exempt" | "overlap" | "taxable" | "unknown";
  monthsLeft?: number;
  message: string;
} {
  // Need a purchase date to reason at all
  if (!prop.purchaseDate) {
    return { status: "unknown", message: "הזן תאריך רכישה לחישוב מס שבח." };
  }

  // Treat a property as "primary" if explicitly flagged, OR if it's the
  // only residence in the portfolio with type="residence".
  const residences = all.filter(p => p.type === "residence");
  const flagged = all.filter(p => p.isPrimaryResidence);
  const isPrimary = prop.isPrimaryResidence ||
    (residences.length === 1 && residences[0].id === prop.id);

  if (residences.length <= 1 && (isPrimary || prop.type === "residence")) {
    // 2026-04-28: ceiling note added per finance audit. Properties valued
    // above ₪4.5M get only PARTIAL exemption — message must reflect this.
    const message = (prop.currentValue || 0) > 4_500_000
      ? "פטור חלקי — מעל תקרה ₪4.5M"
      : "פטור — דירה יחידה";
    return { status: "exempt", message };
  }

  // Two+ residences: check 18-month overlap window from a primary purchase.
  // Pick the OTHER primary residence (the one we bought to replace).
  const otherPrimary = flagged.find(p => p.id !== prop.id) ||
    residences.find(p => p.id !== prop.id);

  if (otherPrimary?.purchaseDate) {
    const purchaseMs = new Date(prop.purchaseDate + "-01").getTime();
    const otherMs    = new Date(otherPrimary.purchaseDate + "-01").getTime();
    const diffMonths = Math.abs((purchaseMs - otherMs) / (1000 * 60 * 60 * 24 * 30.4375));
    if (diffMonths < 18) {
      const monthsLeft = Math.max(0, Math.ceil(18 - diffMonths));
      return {
        status: "overlap",
        monthsLeft,
        message: `תקופת חפיפה — עוד ${monthsLeft} חודשים לפטור`,
      };
    }
  }

  return {
    status: "taxable",
    message: "חייב במס שבח (25% על הרווח הריאלי)",
  };
}
