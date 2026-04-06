/**
 * Number Utilities — Israeli Banking Format Handler
 * Handles commas, minus signs, parentheses (negative), RTL marks, currency symbols.
 */

/**
 * Aggressive amount cleaner — strips EVERYTHING except digits, dot, minus.
 * Used as pre-processing before parseFloat.
 *
 * Examples:
 *   "₪1,250.50"  → 1250.5
 *   "1,250.50-"  → -1250.5
 *   "(3,400)"    → -3400
 *   "$150.00"    → 150
 *   "- 1,500"    → -1500
 *   "1 250.50"   → 1250.5
 *   ""           → 0
 */
export function cleanAmount(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;

  let s = String(raw).trim();

  // Remove RTL/LTR marks
  s = s.replace(/[\u200F\u200E\u200B\u200C\u200D\uFEFF]/g, "");

  if (!s || s === "-" || s === "—" || s === "–") return 0;

  // Accounting negative: (1,234.56)
  const parenMatch = s.match(/^\((.+)\)$/);
  if (parenMatch) {
    s = "-" + parenMatch[1];
  }

  // Trailing minus: 1,234.56-  or  1,234.56 -
  if (/^[^-].*-\s*$/.test(s)) {
    s = "-" + s.replace(/-\s*$/, "");
  }

  // Strip everything except digits, dot, minus
  // First preserve the minus sign position
  const isNeg = s.startsWith("-") || s.startsWith("−");
  s = s.replace(/[^\d.]/g, "");

  // Handle multiple dots — European format: 1.250.50 → 1250.50
  const dotParts = s.split(".");
  if (dotParts.length > 2) {
    const last = dotParts.pop()!;
    s = dotParts.join("") + "." + last;
  } else if (dotParts.length === 2) {
    // Single dot — check if it's decimal or thousands separator
    // If exactly 3 digits after dot AND nothing before dot has fewer than 3 digits at end → thousands
    // e.g. "1.250" (thousands) vs "1.25" (decimal) vs "12.50" (decimal)
    const afterDot = dotParts[1];
    if (afterDot.length === 3 && dotParts[0].length >= 1 && dotParts[0].length <= 3) {
      // Likely European thousands: "1.250" → 1250, "12.500" → 12500
      s = dotParts.join("");
    }
    // else keep dot as decimal separator
  }

  if (!s) return 0;

  const num = parseFloat(s);
  if (isNaN(num)) return 0;

  return isNeg ? -Math.abs(num) : num;
}

/**
 * Parse an Israeli-formatted number string to a clean number.
 * "1,500.00" → 1500
 * "-₪2,300" → -2300
 * "(1,000)" → -1000  (accounting negative)
 * "5,000-" → -5000   (trailing minus — common in Israeli bank exports)
 * "1,250.50-" → -1250.5
 */
export function parseILNumber(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;

  let s = String(raw).trim();

  // Remove RTL marks, currency symbols, spaces
  s = s.replace(/[\u200F\u200E\u200B₪$€\s]/g, "");

  if (!s || s === "-" || s === "—" || s === "–") return 0;

  // Accounting negative: (1,234.56)
  const parenMatch = s.match(/^\((.+)\)$/);
  if (parenMatch) {
    s = "-" + parenMatch[1];
  }

  // Trailing minus: 1,234.56-
  if (s.endsWith("-") && !s.startsWith("-")) {
    s = "-" + s.slice(0, -1);
  }

  // Unicode minus (−) to ASCII minus
  s = s.replace(/−/g, "-");

  // Remove thousands separators (commas)
  s = s.replace(/,/g, "");

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

/**
 * Try to parse a date string from Israeli bank formats.
 * Supports: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd
 */
export function parseILDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim().replace(/[\u200F\u200E]/g, "");

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const match = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    let year = match[3];
    if (year.length === 2) {
      const y = parseInt(year);
      year = (y >= 50 ? "19" : "20") + year;
    }
    return `${year}-${month}-${day}`;
  }

  return s; // fallback: return as-is
}
