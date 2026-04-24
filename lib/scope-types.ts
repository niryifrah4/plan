/**
 * Scope — Personal vs Business tagging for budget rows,
 * transactions and buckets. Optional field — undefined is
 * treated as "personal" everywhere in the app.
 */

export type Scope = "personal" | "business" | "mixed";

export const SCOPE_LABELS: Record<Scope, string> = {
  personal: "פרטי",
  business: "עסקי",
  mixed: "מעורב",
};

export const SCOPE_COLORS: Record<Scope, string> = {
  personal: "#1B4332",
  business: "#3b82f6",
  mixed: "#2B694D",
};

export const SCOPE_ICONS: Record<Scope, string> = {
  personal: "home",
  business: "work",
  mixed: "swap_horiz",
};

/** Treat undefined as "personal" — the system default. */
export function effectiveScope(scope: Scope | undefined): Scope {
  return scope || "personal";
}

/** Cycle personal → business → mixed → undefined (reset). */
export function cycleScope(scope: Scope | undefined): Scope | undefined {
  if (scope === undefined) return "personal";
  if (scope === "personal") return "business";
  if (scope === "business") return "mixed";
  return undefined;
}

/**
 * Default scope for a categorizer key. Used during auto-import
 * so the advisor has a sensible starting point.
 */
export function defaultScopeForCategory(key: string): Scope {
  switch (key) {
    // Clearly business (no obvious keys today, kept for future)
    // Ambiguous — advisor should review
    case "transport":
    case "utilities":
    case "dining_out":
      return "mixed";
    // Everything else defaults to personal
    default:
      return "personal";
  }
}
