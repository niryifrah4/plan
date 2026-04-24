/**
 * ═══════════════════════════════════════════════════════════
 *  Allocation Engine — חישוב אלוקציה מצרפית רב-ממדית
 * ═══════════════════════════════════════════════════════════
 *
 * מקבל רשימת נכסים עם allocation לכל אחד,
 * מחשב ממוצע משוקלל לפי שווי,
 * מחזיר breakdown ל-4 ממדים: מטבע, גיאוגרפיה, אפיק, נזילות.
 */

import type { FundAllocation } from "./fund-registry";

/* ── Types ── */

export interface AssetWithAllocation {
  id: string;
  name: string;
  value: number;
  sector: "pension" | "investment" | "realestate" | "cash" | "insurance" | "debt";
  allocation: FundAllocation;
}

export interface BreakdownSlice {
  label: string;
  value: number;
  pct: number;
  color: string;
}

export interface AllocationBreakdown {
  currency: BreakdownSlice[];
  geography: BreakdownSlice[];
  assetClass: BreakdownSlice[];
  liquidity: BreakdownSlice[];
  totalValue: number;
}

/* ── Label & Color Maps ── */

const CURRENCY_LABELS: Record<string, string> = {
  ILS: "שקל", USD: "דולר", EUR: "אירו", OTHER: "אחר",
};
const CURRENCY_COLORS: Record<string, string> = {
  ILS: "#1B4332", USD: "#1a6b42", EUR: "#2B694D", OTHER: "#2B694D",
};

const GEO_LABELS: Record<string, string> = {
  IL: "ישראל", US: "ארה״ב", EU: "אירופה", EM: "שווקים מתפתחים", OTHER: "אחר",
};
const GEO_COLORS: Record<string, string> = {
  IL: "#1B4332", US: "#1a6b42", EU: "#2B694D", EM: "#2B694D", OTHER: "#d8e0d0",
};

const CLASS_LABELS: Record<string, string> = {
  equity: "מניות", bonds: "אג״ח", realEstate: "נדל״ן",
  cash: "מזומן", alternative: "אלטרנטיבי",
};
const CLASS_COLORS: Record<string, string> = {
  equity: "#1B4332", bonds: "#1a6b42", realEstate: "#2B694D",
  cash: "#2B694D", alternative: "#f59e0b",
};

const LIQ_LABELS: Record<string, string> = {
  immediate: "נזיל מיידי",
  conditional: "נזיל בתנאים",
  locked: "לא נזיל",
};
const LIQ_COLORS: Record<string, string> = {
  immediate: "#2B694D", conditional: "#f59e0b", locked: "#b91c1c",
};

/* ── Core Computation ── */

export function computeAllocation(assets: AssetWithAllocation[]): AllocationBreakdown {
  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  if (totalValue === 0) return emptyBreakdown();

  const currency: Record<string, number> = { ILS: 0, USD: 0, EUR: 0, OTHER: 0 };
  const geography: Record<string, number> = { IL: 0, US: 0, EU: 0, EM: 0, OTHER: 0 };
  const assetClass: Record<string, number> = { equity: 0, bonds: 0, realEstate: 0, cash: 0, alternative: 0 };
  const liquidity: Record<string, number> = { immediate: 0, conditional: 0, locked: 0 };

  for (const asset of assets) {
    const weight = asset.value / totalValue;

    for (const [key, pct] of Object.entries(asset.allocation.currency)) {
      currency[key] = (currency[key] || 0) + pct * weight;
    }
    for (const [key, pct] of Object.entries(asset.allocation.geography)) {
      geography[key] = (geography[key] || 0) + pct * weight;
    }
    for (const [key, pct] of Object.entries(asset.allocation.assetClass)) {
      assetClass[key] = (assetClass[key] || 0) + (pct as number) * weight;
    }
    liquidity[asset.allocation.liquidity] += asset.value;
  }

  return {
    currency: toSlices(currency, CURRENCY_LABELS, CURRENCY_COLORS, totalValue),
    geography: toSlices(geography, GEO_LABELS, GEO_COLORS, totalValue),
    assetClass: toSlices(assetClass, CLASS_LABELS, CLASS_COLORS, totalValue),
    liquidity: Object.entries(liquidity)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({
        label: LIQ_LABELS[k] || k,
        value: v,
        pct: Math.round((v / totalValue) * 100),
        color: LIQ_COLORS[k] || "#999",
      })),
    totalValue,
  };
}

function toSlices(
  data: Record<string, number>,
  labels: Record<string, string>,
  colors: Record<string, string>,
  totalValue: number,
): BreakdownSlice[] {
  return Object.entries(data)
    .filter(([, v]) => v > 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({
      label: labels[k] || k,
      value: totalValue * v / 100,
      pct: Math.round(v),
      color: colors[k] || "#999",
    }));
}

/* ── Automatic Insights ── */

export function generateInsights(breakdown: AllocationBreakdown): string[] {
  const insights: string[] = [];
  const { currency, geography, assetClass, liquidity, totalValue } = breakdown;

  // Currency concentration
  const usd = currency.find(c => c.label.includes("דולר"));
  if (usd && usd.pct > 40) {
    insights.push(`${usd.pct}% מהתיק חשוף לדולר — ירידה של 5% בדולר תשפיע על כ-${Math.round(totalValue * usd.pct / 100 * 0.05).toLocaleString("he-IL")}₪ מהתיק`);
  }

  // Geographic concentration
  const topGeo = geography[0];
  if (topGeo && topGeo.pct > 60) {
    insights.push(`${topGeo.pct}% מהתיק מרוכז ב${topGeo.label} — שקלו לגוון`);
  }

  // Liquidity
  const locked = liquidity.find(l => l.label.includes("לא נזיל"));
  const immediate = liquidity.find(l => l.label.includes("מיידי"));
  if (locked && locked.pct > 50) {
    const availableNow = immediate ? immediate.value : 0;
    insights.push(`${locked.pct}% מהכסף לא נזיל — רק ${availableNow.toLocaleString("he-IL")}₪ זמינים מיידית`);
  }

  // Equity exposure
  const equity = assetClass.find(a => a.label.includes("מניות"));
  if (equity && equity.pct > 70) {
    insights.push(`${equity.pct}% מהתיק במניות — סיכון גבוה, מתאים לטווח ארוך בלבד`);
  }
  if (equity && equity.pct < 20) {
    insights.push(`רק ${equity.pct}% מהתיק במניות — ייתכן שהתיק לא מנצל את פוטנציאל הצמיחה`);
  }

  return insights;
}

/* ── Empty breakdown ── */

function emptyBreakdown(): AllocationBreakdown {
  return { currency: [], geography: [], assetClass: [], liquidity: [], totalValue: 0 };
}
