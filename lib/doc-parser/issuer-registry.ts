export type IssuerKind = "credit" | "bank";

export type ParserVariant = {
  id: string;
  label: string;
  parserFile: string;
  description?: string;
};

export type Issuer = {
  id: string;
  label: string;
  kind: IssuerKind;
  hasParser: boolean;
  parserFile?: string;
  parserVariants?: ParserVariant[];
  aliases?: string[];
};

export const ISSUERS: Issuer[] = [
  {
    id: "isracard",
    label: "ישראכרט",
    kind: "credit",
    hasParser: false,
    aliases: ["isracard", "ישרא כרט"],
  },
  {
    id: "cal",
    label: "כאל",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/cal-pdf-parser.ts",
    parserVariants: [
      {
        id: "cal:digital-detail",
        label: "דף פירוט דיגיטלי",
        parserFile: "lib/doc-parser/cal-pdf-parser.ts",
        description: "פורמט CAL/Diners שבו השורות נשלפות הפוכות RTL עם תאריך הפוך בסוף השורה.",
      },
    ],
    aliases: ["ויזה כאל", "visa cal", "כרטיסי אשראי לישראל", "דיינרס"],
  },
  {
    id: "max",
    label: "מקס",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/max-pdf-parser.ts",
    parserVariants: [
      {
        id: "max:monthly-statement",
        label: "דף חיובים חודשי",
        parserFile: "lib/doc-parser/max-pdf-parser.ts",
        description: "פורמט MAX עם טבלאות עסקות בארץ ועסקות חו״ל, כולל BIT/PAYBOX.",
      },
    ],
    aliases: ["max", "לאומי קארד", "leumi card"],
  },
  {
    id: "american-express",
    label: "אמריקן אקספרס",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/amex-pdf-parser.ts",
    parserVariants: [
      {
        id: "american-express:monthly-local",
        label: "דף חיובים חודשי - עסקות בארץ",
        parserFile: "lib/doc-parser/amex-pdf-parser.ts",
        description: "פורמט אמריקן אקספרס עם עמודות: הוצג/לא הוצג, ענף, בית עסק וסכום חיוב.",
      },
    ],
    aliases: ["אמקס", "amex", "american express"],
  },
  {
    id: "diners",
    label: "דיינרס",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/cal-pdf-parser.ts",
    parserVariants: [
      {
        id: "diners:digital-detail",
        label: "דף פירוט דיגיטלי",
        parserFile: "lib/doc-parser/cal-pdf-parser.ts",
        description: "דיינרס מזוהה בפורמט CAL הקיים.",
      },
    ],
    aliases: ["diners"],
  },
  {
    id: "leumi-visa",
    label: "ויזה לאומי",
    kind: "credit",
    hasParser: false,
    aliases: ["לאומי ויזה", "ויזה בינלאומי"],
  },
  {
    id: "hapoalim",
    label: "בנק הפועלים",
    kind: "bank",
    hasParser: false,
    aliases: ["poalim", "bank hapoalim", "בנק 12"],
  },
  {
    id: "leumi",
    label: "בנק לאומי",
    kind: "bank",
    hasParser: false,
    aliases: ["leumi", "bank leumi", "בנק 10"],
  },
  {
    id: "discount",
    label: "בנק דיסקונט",
    kind: "bank",
    hasParser: false,
    aliases: ["discount", "bank discount", "בנק 11"],
  },
  {
    id: "mizrahi-tefahot",
    label: "בנק מזרחי-טפחות",
    kind: "bank",
    hasParser: false,
    aliases: ["mizrahi", "tefahot", "בנק 20"],
  },
  {
    id: "fibi",
    label: "בנק הבינלאומי",
    kind: "bank",
    hasParser: false,
    aliases: ["fibi", "international", "בנק 31"],
  },
  {
    id: "mercantile",
    label: "בנק מרכנתיל",
    kind: "bank",
    hasParser: false,
    aliases: ["mercantile", "בנק 17"],
  },
  {
    id: "massad",
    label: "בנק מסד",
    kind: "bank",
    hasParser: false,
    aliases: ["massad", "בנק 46"],
  },
  {
    id: "yahav",
    label: "בנק יהב",
    kind: "bank",
    hasParser: false,
    aliases: ["yahav", "בנק 04"],
  },
  {
    id: "jerusalem",
    label: "בנק ירושלים",
    kind: "bank",
    hasParser: false,
    aliases: ["jerusalem", "בנק 54"],
  },
  {
    id: "otsar-hahayal",
    label: "בנק אוצר החייל",
    kind: "bank",
    hasParser: false,
    aliases: ["אוצר החייל", "otsar hahayal", "בנק 14"],
  },
  {
    id: "one-zero",
    label: "וואן זירו",
    kind: "bank",
    hasParser: false,
    aliases: ["one zero", "1zero"],
  },
  {
    id: "bank-esh",
    label: "בנק אש ישראל",
    kind: "bank",
    hasParser: false,
    aliases: ["אש ישראל", "esh bank", "בנק 03"],
  },
  {
    id: "postal-bank",
    label: "בנק הדואר",
    kind: "bank",
    hasParser: false,
    aliases: ["דואר ישראל", "postal bank", "בנק 09"],
  },
];

export const ISSUER_IDS = new Set(ISSUERS.map((issuer) => issuer.id));
export const ISSUER_STATUS_IDS = new Set([
  ...ISSUERS.map((issuer) => issuer.id),
  ...ISSUERS.flatMap((issuer) => issuer.parserVariants?.map((variant) => variant.id) ?? []),
]);
