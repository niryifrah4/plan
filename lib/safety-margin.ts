/**
 * Safety-margin colour rule — shared between charts + dashboard warnings.
 *
 *   gap < 0              → red       (shortfall)
 *   1 ≤ gap ≤ 1,000 ₪    → orange    ("מרווח ביטחון נמוך")
 *   gap > 1,000 ₪         → green     (safe)
 */

export const SAFETY_THRESHOLD_ILS = 1000;

export const GAP_COLOURS = {
  shortfall: "#b91c1c",   // red
  warning:   "#f59e0b",   // amber/orange
  safe:      "#1B4332",   // verdant accent
} as const;

export function gapColor(gap: number): string {
  if (gap < 0) return GAP_COLOURS.shortfall;
  if (gap >= 1 && gap <= SAFETY_THRESHOLD_ILS) return GAP_COLOURS.warning;
  return GAP_COLOURS.safe;
}

export function isLowSafetyMargin(gap: number): boolean {
  return gap >= 1 && gap <= SAFETY_THRESHOLD_ILS;
}

export function safetyLabel(gap: number): string | null {
  if (gap < 0) return "תזרים שלילי — גירעון";
  if (isLowSafetyMargin(gap)) return "מרווח ביטחון נמוך — אזור לא בטוח לתכנון תקציב";
  return null;
}
