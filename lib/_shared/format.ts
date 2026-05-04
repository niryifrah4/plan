/**
 * ILS formatting utilities — consistent money display across the system.
 */

interface FmtOpts {
  /** Force a leading + for positive values (e.g. variances). */
  signed?: boolean;
}

export function fmtILS(value: number | null | undefined, opts: FmtOpts = {}): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  const abs = Math.abs(rounded).toLocaleString("en-US");
  if (rounded < 0) return "−₪" + abs;
  if (opts.signed && rounded > 0) return "+₪" + abs;
  return "₪" + abs;
}

export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(decimals) + "%";
}

export function fmtK(value: number): string {
  return Math.round(value / 1000) + "K";
}

/** Hebrew month labels */
export const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
