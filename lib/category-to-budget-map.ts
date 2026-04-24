/**
 * Category → Budget Row Mapping
 *
 * Maps categorizer keys (from lib/doc-parser/categorizer.ts) to target budget
 * rows (section + Hebrew row name) as defined in DEFAULT_SECTIONS inside
 * app/(client)/budget/page.tsx.
 *
 * Row names MUST match DEFAULT_SECTIONS exactly — otherwise the import logic
 * will fall back to creating new rows instead of updating existing ones.
 */

export type BudgetSection = "income" | "fixed" | "variable" | "business";

export interface BudgetTarget {
  section: BudgetSection;
  rowName: string;
}

/**
 * Every category key produced by categorize() in lib/doc-parser/categorizer.ts.
 * Keys not in this map will be collected as "unmatched" by the importer.
 */
export const CATEGORY_TO_BUDGET: Record<string, BudgetTarget> = {
  // ── Income ──
  salary:        { section: "income",   rowName: "משכורת נטו" },
  refunds:       { section: "income",   rowName: "הכנסה נוספת" },
  transfers:     { section: "income",   rowName: "הכנסה נוספת" },

  // ── Fixed expenses ──
  housing:       { section: "fixed",    rowName: "משכנתא / שכירות" },
  utilities:     { section: "fixed",    rowName: "חשמל" },
  insurance:     { section: "fixed",    rowName: "ביטוחים" },
  education:     { section: "fixed",    rowName: "גן / חינוך" },
  subscriptions: { section: "fixed",    rowName: "מנויים" },
  fees:          { section: "fixed",    rowName: "ועד בית + ארנונה" },
  pension:       { section: "fixed",    rowName: "ביטוחים" },

  // ── Variable expenses ──
  food:             { section: "variable", rowName: "סופר / מזון" },
  transport:        { section: "variable", rowName: "דלק / תחבורה" },
  dining_out:       { section: "variable", rowName: "מסעדות" },
  health:           { section: "variable", rowName: "בריאות" },
  shopping:         { section: "variable", rowName: "ביגוד / קניות" },
  leisure:          { section: "variable", rowName: "פנאי ובילוי" },
  home_maintenance: { section: "variable", rowName: "תחזוקת בית" },
  misc:             { section: "variable", rowName: "שונות" },

  // ── Fallbacks ──
  cash:          { section: "variable", rowName: "פנאי ובילוי" },
  other:         { section: "variable", rowName: "שונות" },
};
