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
  const sign = rounded < 0 ? "−" : opts.signed && rounded > 0 ? "+" : "";
  return `\u2066${sign}${abs} ₪\u2069`;
}

export function fmtMoney(value: number | null | undefined, currency: string, opts: FmtOpts = {}): string {
  if (value == null || Number.isNaN(value)) return "—";
  // For USD we often keep 2 decimals, but to match the ILS display we can round or use toFixed(2).
  // The system seems to round to whole numbers for ILS, let's do the same or 2 decimals for USD?
  // Let's do 2 decimals for USD and 0 for ILS, or just 2 for both?
  // Original fmtILS does Math.round. Let's keep 2 decimals for USD.
  const isUsd = currency === "USD";
  const absNum = Math.abs(value);
  const absStr = isUsd ? absNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(absNum).toLocaleString("en-US");
  const sign = value < 0 ? "−" : opts.signed && value > 0 ? "+" : "";
  const symbol = isUsd ? "$" : "₪";
  return `\u2066${sign}${absStr} ${symbol}\u2069`;
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

/** ISO yyyy-mm-dd → Israeli dd/mm/yyyy. */
export function fmtDateIL(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
