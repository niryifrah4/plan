"use client";

import type { BucketPriority } from "@/lib/buckets-store";

export const GOAL_ICONS: Record<string, string> = {
  "קרן חירום": "savings",
  חינוך: "school",
  "חינוך ילדים": "school",
  לימודים: "school",
  רכב: "directions_car",
  "החלפת רכב": "directions_car",
  דירה: "home",
  "שדרוג דיור": "home",
  "רכישת דירה": "home",
  חתונה: "favorite",
  חופשה: "flight_takeoff",
  פרישה: "elderly",
  "פרישה מוקדמת": "elderly",
  עסק: "storefront",
  "פתיחת עסק": "storefront",
  default: "flag",
};

export const PRIORITY_COLORS: Record<BucketPriority, { bg: string; text: string }> = {
  high: { bg: "#8B2E2E10", text: "#8B2E2E" },
  medium: { bg: "#B4530910", text: "#B45309" },
  low: { bg: "#2C7A5A10", text: "#2C7A5A" },
};
export const PRIORITY_LABELS: Record<BucketPriority, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};
export const PRIORITY_ORDER: Record<BucketPriority, number> = { high: 0, medium: 1, low: 2 };

export const STATUS_COLOR: Record<string, string> = {
  ahead: "#2C7A5A",
  on_track: "#059669",
  behind: "#B45309",
  at_risk: "#8B2E2E",
};
export const STATUS_LABEL: Record<string, string> = {
  ahead: "מקדים",
  on_track: "בקצב",
  behind: "בפיגור",
  at_risk: "בסיכון",
};

export interface InstrumentSpec {
  label: string;
  rate: number;
  horizon: string;
  taxNote: string;
  category: string;
}

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  pension: {
    label: "קרן פנסיה",
    rate: 0.05,
    horizon: "long",
    taxNote: "פטור ממס על קצבה עד תקרה. הפקדות מוכרות כניכוי/זיכוי מס.",
    category: "פנסיוני",
  },
  "managers-insurance": {
    label: "ביטוח מנהלים",
    rate: 0.045,
    horizon: "long",
    taxNote: "דמי ניהול גבוהים יותר מפנסיה. פטור ממס על קצבה עד תקרה.",
    category: "פנסיוני",
  },
  "gemel-savings": {
    label: "קופת גמל לחיסכון",
    rate: 0.05,
    horizon: "long",
    taxNote: "משיכה כקצבה — פטור. משיכה הונית אחרי 60 — 25% מס רווחי הון.",
    category: "פנסיוני",
  },
  "gemel-invest": {
    label: "קופת גמל להשקעה",
    rate: 0.055,
    horizon: "medium",
    taxNote: "25% מס רווחי הון. נזילה אחרי 15 שנה ללא מס, או בכל עת עם מס.",
    category: "פנסיוני",
  },
  "gemel-child": {
    label: "קופת גמל לילד",
    rate: 0.05,
    horizon: "long",
    taxNote: "פטור ממס רווחי הון עד גיל 18. אחרי 18 — 25% מס.",
    category: "פנסיוני",
  },
  hishtalmut: {
    label: "קרן השתלמות",
    rate: 0.05,
    horizon: "medium",
    taxNote: "פטור מלא ממס רווחי הון אחרי 6 שנים (3 לגיל 60+). עד תקרת הפקדה.",
    category: "חיסכון מוטה מס",
  },
  "savings-policy": {
    label: "פוליסת חיסכון",
    rate: 0.04,
    horizon: "medium",
    taxNote: "25% מס רווחי הון. ללא דמי ניהול מההפקדה (רק מהצבירה).",
    category: "חיסכון מוטה מס",
  },
  "etf-israel": {
    label: "קרן סל ישראלית",
    rate: 0.06,
    horizon: "medium",
    taxNote: "25% מס רווחי הון.",
    category: "תיק השקעות עצמאי",
  },
  "etf-global": {
    label: "קרן סל עולמית (S&P 500 וכו׳)",
    rate: 0.08,
    horizon: "long",
    taxNote: '25% מס רווחי הון. חשיפה למט"ח.',
    category: "תיק השקעות עצמאי",
  },
  "mutual-fund": {
    label: "קרן נאמנות",
    rate: 0.055,
    horizon: "medium",
    taxNote: "25% מס רווחי הון. דמי ניהול משתנים.",
    category: "תיק השקעות עצמאי",
  },
  "money-market": {
    label: "קרן כספית",
    rate: 0.04,
    horizon: "short",
    taxNote: "25% מס רווחי הון. נזילות מיידית.",
    category: "נזיל",
  },
  "bank-deposit": {
    label: "פיקדון בנקאי",
    rate: 0.035,
    horizon: "short",
    taxNote: "15% מס על ריבית.",
    category: "נזיל",
  },
  "bank-savings": {
    label: "תוכנית חיסכון בנקאית",
    rate: 0.038,
    horizon: "short",
    taxNote: "15% מס. נעול לתקופה קבועה.",
    category: "נזיל",
  },
};

export const INSTRUMENT_CATEGORIES = [
  "פנסיוני",
  "חיסכון מוטה מס",
  "תיק השקעות עצמאי",
  "נזיל",
];

export function instrumentsByCategory() {
  return INSTRUMENT_CATEGORIES.map((cat) => ({
    category: cat,
    items: Object.entries(INSTRUMENTS)
      .filter(([, v]) => v.category === cat)
      .map(([k, v]) => ({ key: k, label: v.label })),
  })).filter((g) => g.items.length > 0);
}

export const BUCKET_PRESETS: {
  name: string;
  icon: string;
  targetAmount: number;
  years: number;
  priority: BucketPriority;
  instrument: string;
  color: string;
}[] = [
  { name: "רכישת דירה", icon: "home", targetAmount: 500000, years: 7, priority: "high", instrument: "etf-global", color: "#2563eb" },
  { name: "החלפת רכב", icon: "directions_car", targetAmount: 150000, years: 3, priority: "medium", instrument: "money-market", color: "#d97706" },
  { name: "חינוך ילדים", icon: "school", targetAmount: 200000, years: 10, priority: "medium", instrument: "hishtalmut", color: "#16a34a" },
  { name: "חתונה", icon: "favorite", targetAmount: 80000, years: 2, priority: "high", instrument: "bank-savings", color: "#be185d" },
  { name: "חופשה", icon: "flight_takeoff", targetAmount: 25000, years: 1, priority: "low", instrument: "money-market", color: "#0891b2" },
  { name: "טיול גדול", icon: "luggage", targetAmount: 60000, years: 2, priority: "low", instrument: "money-market", color: "#7c3aed" },
  { name: "לימודים", icon: "school", targetAmount: 120000, years: 3, priority: "medium", instrument: "bank-savings", color: "#0284c7" },
  { name: "קרן חירום", icon: "savings", targetAmount: 80000, years: 1, priority: "high", instrument: "bank-deposit", color: "#dc2626" },
  { name: "פרישה מוקדמת", icon: "elderly", targetAmount: 3000000, years: 25, priority: "medium", instrument: "gemel-invest", color: "#4338ca" },
  { name: "פתיחת עסק", icon: "storefront", targetAmount: 300000, years: 5, priority: "medium", instrument: "etf-global", color: "#0f766e" },
];

export function getIcon(name: string): string {
  for (const [key, icon] of Object.entries(GOAL_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return GOAL_ICONS.default;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatYears(months: number): string {
  if (months < 12) return `${months} חודשים`;
  const years = months / 12;
  if (years < 2) {
    const remMonths = Math.round(months - 12);
    return remMonths > 0 ? `שנה ו-${remMonths} חודשים` : "שנה";
  }
  return `${Math.round(years)} שנים`;
}

export function taxRecommendation(years: number, amount: number): string | null {
  const tips: string[] = [];
  if (years <= 3) tips.push("לטווח קצר — קרן כספית או תוכנית חיסכון");
  else if (years <= 6) tips.push("קרן השתלמות — פטור ממס אחרי 6 שנים (עד תקרה)");
  else if (years <= 15) tips.push("קרן סל עולמית או קופת גמל להשקעה — פיזור + יתרון מס");
  else tips.push("קופת גמל להשקעה (פטור אחרי 15 שנה) או קרן פנסיה");
  if (amount > 300000 && years > 5)
    tips.push("שקול פיצול: קרן השתלמות + קרן סל + קופת גמל להשקעה");
  return tips.length > 0 ? tips.join("\n") : null;
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold text-verdant-muted">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
        style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
      />
    </div>
  );
}

export function InstrumentSelect({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (key: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={style}
    >
      {instrumentsByCategory().map((g) => (
        <optgroup key={g.category} label={g.category}>
          {g.items.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
