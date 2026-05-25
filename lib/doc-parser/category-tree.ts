/**
 * ═══════════════════════════════════════════════════════════
 *  Category Tree — parent → leaf hierarchy
 * ═══════════════════════════════════════════════════════════
 *
 * The 24 leaf categories in `categorizer.ts` (housing, food, advertising_marketing, …)
 * are the source of truth — transactions are stored with leaf keys, the AI
 * classifies into leaves, the keyword matcher returns leaves.
 *
 * THIS module adds a presentation + aggregation layer on top:
 *   - 10 parent groups (דיור, מזון, תחבורה, …)
 *   - `LEAF_TO_PARENT` map — every leaf belongs to exactly one parent
 *   - helpers to render <optgroup>s in dropdowns and roll up reports
 *
 * Inspired by Spent's hierarchical categories — they have a strict rule:
 *   "Group headers are NOT valid categoryName values" — users must pick leaves.
 * Same here: we only ever write/store/AI-classify into leaf keys; the parent
 * layer is for grouping and aggregation only.
 *
 * No data migration needed — existing transactions keep their leaf keys
 * and roll up correctly through `getParentKey(leafKey)`.
 */

export interface ParentCategory {
  key: string;
  label: string;
  icon: string;
  color: string;
  /** Display order in dropdowns + reports (lower = earlier). */
  order: number;
}

export const PARENT_CATEGORIES: ParentCategory[] = [
  { key: "p_housing", label: "דיור וחשבונות בית", icon: "home", color: "#1B4332", order: 1 },
  { key: "p_food", label: "מזון ואוכל", icon: "restaurant", color: "#059669", order: 2 },
  { key: "p_transport", label: "תחבורה ורכב", icon: "directions_car", color: "#3b82f6", order: 3 },
  { key: "p_health", label: "בריאות", icon: "local_hospital", color: "#ef4444", order: 4 },
  { key: "p_kids", label: "ילדים וחינוך", icon: "school", color: "#0E7490", order: 5 },
  { key: "p_lifestyle", label: "פנאי וקניות", icon: "shopping_bag", color: "#ec4899", order: 6 },
  { key: "p_insurance", label: "ביטוח ופנסיה", icon: "shield", color: "#06b6d4", order: 7 },
  { key: "p_financial", label: "פיננסי וכספים", icon: "account_balance", color: "#64748b", order: 8 },
  { key: "p_business", label: "עסקי", icon: "business_center", color: "#7C3AED", order: 9 },
  { key: "p_misc", label: "שונות", icon: "category", color: "#9ca3af", order: 10 },
];

/**
 * Every leaf category key in `categorizer.ts` belongs to exactly one parent.
 * Keep in sync when adding a new CATEGORIES entry — `getParentKey()` falls
 * back to "p_misc" silently for unknown keys, which is forgiving but means
 * a new leaf without a parent assignment lands in שונות by default.
 */
export const LEAF_TO_PARENT: Record<string, string> = {
  // Housing & home bills
  housing: "p_housing",
  utilities: "p_housing",
  home_maintenance: "p_housing",

  // Food
  food: "p_food",
  dining_out: "p_food",

  // Transport
  transport: "p_transport",

  // Health
  health: "p_health",

  // Kids & education
  education: "p_kids",

  // Lifestyle / shopping
  leisure: "p_lifestyle",
  shopping: "p_lifestyle",
  subscriptions: "p_lifestyle",

  // Insurance + pension
  insurance: "p_insurance",
  pension: "p_insurance",

  // Financial / money movement
  transfers: "p_financial",
  cash: "p_financial",
  fees: "p_financial",
  refunds: "p_financial",
  salary: "p_financial",

  // Self-employed business
  advertising_marketing: "p_business",
  professional_services: "p_business",
  business_taxes: "p_business",
  business_payments: "p_business",

  // Catch-all
  misc: "p_misc",
  other: "p_misc",
};

/** Look up the parent key for a leaf. Unknown leaves fall to "p_misc". */
export function getParentKey(leafKey: string): string {
  return LEAF_TO_PARENT[leafKey] || "p_misc";
}

/** Look up the full parent category object for a leaf. */
export function getParent(leafKey: string): ParentCategory {
  const k = getParentKey(leafKey);
  return PARENT_CATEGORIES.find((p) => p.key === k) || PARENT_CATEGORIES[PARENT_CATEGORIES.length - 1];
}

/** Shape returned from `groupOptionsByParent` — drives <optgroup> rendering. */
export interface GroupedCatOption {
  parent: ParentCategory;
  options: { key: string; label: string }[];
}

/**
 * Take a flat CAT_OPTIONS array and bucket each option under its parent.
 * Returns groups in PARENT_CATEGORIES.order, dropping groups with no items.
 */
export function groupOptionsByParent(
  flatOptions: { key: string; label: string }[]
): GroupedCatOption[] {
  const sortedParents = [...PARENT_CATEGORIES].sort((a, b) => a.order - b.order);
  return sortedParents
    .map((parent) => ({
      parent,
      options: flatOptions.filter((o) => getParentKey(o.key) === parent.key),
    }))
    .filter((g) => g.options.length > 0);
}

/**
 * Roll up a per-leaf amount map into a per-parent amount map.
 * Used by reports + cashflow breakdowns to surface the high-level picture.
 */
export function aggregateByParent(
  perLeaf: Record<string, number>
): Array<{ parent: ParentCategory; total: number }> {
  const totals = new Map<string, number>();
  for (const [leafKey, amount] of Object.entries(perLeaf)) {
    const pKey = getParentKey(leafKey);
    totals.set(pKey, (totals.get(pKey) || 0) + amount);
  }
  return [...PARENT_CATEGORIES]
    .sort((a, b) => a.order - b.order)
    .map((parent) => ({ parent, total: totals.get(parent.key) || 0 }))
    .filter((g) => g.total !== 0);
}
