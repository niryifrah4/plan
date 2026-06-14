/**
 * ═══════════════════════════════════════════════════════════
 *  Pension / Gemel / Hishtalmut parser registry
 * ═══════════════════════════════════════════════════════════
 *
 * Single source of truth for WHICH provider report formats the app knows how
 * to parse, broken down by:
 *   - company (יצרן: הראל, מגדל, מיטב, אלטשולר שחם ...)
 *   - report file type (סוג קובץ: דוח שנתי מתומצת / מפורט / רבעוני ...)
 *   - fund type (סוג קרן: השתלמות / גמל / פנסיה / ביטוח מנהלים)
 *
 * Drives the advisor settings page at /crm/settings/pension-parsers.
 *
 * status meaning:
 *   - "supported": dedicated parser path, verified against a real sample file.
 *   - "generic":   handled best-effort by the generic detailed-report engine
 *                  (parseAnnualReportText). May need verification per layout.
 *   - "planned":   sample seen, parser not implemented yet.
 */

export type PensionFundType =
  | "hishtalmut" // קרן השתלמות
  | "gemel" // קופת גמל
  | "gemel_investment" // גמל להשקעה
  | "pension" // קרן פנסיה (מקיפה/כללית/משלימה)
  | "bituach"; // ביטוח מנהלים

export type PensionParserStatus = "supported" | "generic" | "planned";

export const FUND_TYPE_LABELS: Record<PensionFundType, string> = {
  hishtalmut: "קרן השתלמות",
  gemel: "קופת גמל",
  gemel_investment: "גמל להשקעה",
  pension: "קרן פנסיה",
  bituach: "ביטוח מנהלים",
};

export const STATUS_META: Record<
  PensionParserStatus,
  { label: string; color: string; bg: string }
> = {
  supported: { label: "נתמך ומאומת", color: "#166534", bg: "#dcfce7" },
  generic: { label: "מנוע גנרי", color: "#92400e", bg: "rgba(217,119,6,0.12)" },
  planned: { label: "בפיתוח", color: "#6B7280", bg: "#F3F4F6" },
};

export type PensionReportType = {
  /** stable id, company:reporttype */
  id: string;
  /** human file-type name (סוג קובץ) */
  label: string;
  /** which fund types this report covers */
  fundTypes: PensionFundType[];
  status: PensionParserStatus;
  /** source file implementing the parser path */
  parserFile?: string;
  /** detection hint — text markers that identify this format */
  detect?: string;
  notes?: string;
};

export type PensionProvider = {
  id: string;
  label: string;
  aliases?: string[];
  reports: PensionReportType[];
};

export const PENSION_PROVIDERS: PensionProvider[] = [
  {
    id: "harel",
    label: "הראל",
    aliases: ["harel", "הראל"],
    reports: [
      {
        id: "harel:summary-annual",
        label: "דוח שנתי מתומצת",
        fundTypes: ["hishtalmut", "gemel"],
        status: "supported",
        parserFile: "lib/doc-parser/annual-report-parser.ts (parseSummaryReport)",
        detect: '"תנועות בחשבונך" + "יתרת הכספים בחשבון בסוף"',
        notes:
          "עמוד אחד, סכומים מעוגלים לשקל. מחלץ יתרה, הפקדות, רווח/הפסד, דמי ניהול, תשואה, מועד נזילות.",
      },
      {
        id: "harel:summary-quarterly",
        label: "דוח רבעוני מתומצת",
        fundTypes: ["hishtalmut", "gemel"],
        status: "supported",
        parserFile: "lib/doc-parser/annual-report-parser.ts (parseSummaryReport)",
        detect: '"רבעוני" + "תנועות בחשבונך" + "בסוף תקופת הדיווח"',
        notes: "כמו השנתי המתומצת; הפקדה חודשית מחושבת לפי הרבעון (חלוקה ב-3).",
      },
      {
        id: "harel:detailed-annual",
        label: "דוח שנתי מפורט",
        fundTypes: ["pension", "gemel", "hishtalmut"],
        status: "generic",
        parserFile: "lib/doc-parser/annual-report-parser.ts (generic)",
        detect: '"דוח שנתי מפורט" / "יתרת החיסכון המצטבר"',
        notes: "נקרא דרך המנוע הגנרי. אומת על דוח פנסיה (יתרה + מסלולים).",
      },
    ],
  },
  {
    id: "altshuler",
    label: "אלטשולר שחם",
    aliases: ["אלטשולר שחם", "altshuler"],
    reports: [
      {
        id: "altshuler:summary-annual",
        label: "דוח שנתי מקוצר + אישורי מס",
        fundTypes: ["hishtalmut", "gemel_investment", "pension"],
        status: "supported",
        parserFile: "lib/doc-parser/annual-report-parser.ts (parseSummaryReport)",
        detect: '"דוח שנתי לעמית" + "תנועות בחשבונך/בקרן"',
        notes:
          "אותו מנוע מתומצת כמו הראל; מזהה תוויות שונות (יתרה 'נכון ל-', תוויות מימין). מטפל בקובץ שמכיל כמה מוצרים (גמל + השתלמות).",
      },
      {
        id: "altshuler:summary-quarterly",
        label: "דוח רבעוני (רבעון 1 / 2)",
        fundTypes: ["pension", "hishtalmut", "gemel_investment"],
        status: "supported",
        parserFile: "lib/doc-parser/annual-report-parser.ts (parseSummaryReport)",
        detect: '"דוח רבעוני לעמית" + "תנועות בחשבונך/בקרן"',
        notes:
          "אומת על רבעון 1 ו-2 (השתלמות + גמל-להשקעה + פנסיה). מפצל אוטומטית מוצרים מרובים בקובץ אחד.",
      },
      {
        id: "altshuler:detailed-annual",
        label: "דוח שנתי מפורט",
        fundTypes: ["pension", "gemel", "hishtalmut"],
        status: "generic",
        parserFile: "lib/doc-parser/annual-report-parser.ts (generic)",
        detect: '"דוח שנתי מפורט לעמיתים" + "יתרת החיסכון המצטבר"',
        notes: "נקרא דרך המנוע הגנרי. דוחות 2023 שהתקבלו הם של חשבונות שנויידו (יתרה 0).",
      },
    ],
  },
  {
    id: "migdal",
    label: "מגדל / מקפת",
    aliases: ["מגדל", "מקפת", "migdal", "makefet"],
    reports: [
      {
        id: "migdal:detailed-annual",
        label: "דוח שנתי לעמית (מקפת משלימה)",
        fundTypes: ["pension", "gemel"],
        status: "generic",
        parserFile: "lib/doc-parser/annual-report-parser.ts (generic)",
        detect: '"מקפת משלימה" / "יתרת החיסכון המצטבר"',
        notes: "אומת — יתרה ומסלולים נקראים נכון (₪294,323). חילוץ מספר חשבון עדיין חלקי.",
      },
    ],
  },
];

/** Aggregate counts for the settings dashboard. */
export function pensionParserCounts() {
  const reports = PENSION_PROVIDERS.flatMap((p) => p.reports);
  return {
    providers: PENSION_PROVIDERS.length,
    reportTypes: reports.length,
    supported: reports.filter((r) => r.status === "supported").length,
    generic: reports.filter((r) => r.status === "generic").length,
    planned: reports.filter((r) => r.status === "planned").length,
  };
}
