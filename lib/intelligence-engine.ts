/**
 * Verdant Ledger · Intelligence Engine
 *
 * Predictive AI layer: identifies idle cash, benchmarks fixed expenses,
 * and generates proactive optimization alerts.
 */

import { loadAssumptions, realReturn } from "./assumptions";
import type { Asset, CashflowSummary } from "@/types/db";
import type { FinancialInstrument, ExposureSlice } from "./stub-data";

/* ─── Types ─── */

export type AlertSeverity = "critical" | "warning" | "info" | "opportunity";

export interface SmartAlert {
  id: string;
  icon: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  impact?: string;          // e.g. "₪12,400/שנה"
  ctaLabel?: string;
  ctaHref?: string;
}

/* ─── Idle Cash Detector ─── */

/**
 * Detects "idle money" — excessive checking account balances that
 * could generate real returns if properly invested.
 * Rule: liquid balance > 3× monthly expenses = idle cash.
 */
export function detectIdleCash(
  liquidAssets: Asset[],
  monthlyExpenses: number,
): SmartAlert | null {
  const totalLiquid = liquidAssets.reduce((s, a) => s + a.balance, 0);
  const threshold = monthlyExpenses * 3; // 3 months is healthy emergency fund
  const excess = totalLiquid - threshold;

  if (excess <= 5000) return null; // Not significant

  const a = loadAssumptions();
  const realRate = realReturn(a.expectedReturnInvest, a.inflationRate, a.managementFeeInvest);
  const annualGain = Math.round(excess * realRate);

  return {
    id: "idle-cash",
    icon: "account_balance_wallet",
    title: "כסף עומד — הון בלתי מנוצל",
    body: `יש לך ${fmt(excess)} מעבר לקרן החירום המומלצת (3 חודשי הוצאה). השקעה בתיק מאוזן יכולה להניב ~${fmt(annualGain)} בשנה בתשואה ריאלית.`,
    severity: "opportunity",
    impact: `+${fmt(annualGain)}/שנה`,
    ctaLabel: "לדף השקעות",
    ctaHref: "/investments",
  };
}

/* ─── Smart Expense Benchmarking ─── */

interface BenchmarkRule {
  category: string;
  label: string;
  marketAvg: number;  // ₪ per month
  icon: string;
}

const EXPENSE_BENCHMARKS: BenchmarkRule[] = [
  { category: "insurance",      label: "ביטוחים",           marketAvg: 1200, icon: "shield" },
  { category: "subscriptions",  label: "מנויים ותקשורת",    marketAvg: 350,  icon: "subscriptions" },
  { category: "fees",           label: "עמלות בנקאיות",     marketAvg: 50,   icon: "account_balance" },
  { category: "utilities",      label: "חשבונות שוטפים",   marketAvg: 1800, icon: "bolt" },
];

/**
 * Compares fixed expense categories against market averages.
 * Returns alerts for categories where user pays significantly more.
 */
export function benchmarkExpenses(
  monthlyByCategory: Record<string, number>,
): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  for (const rule of EXPENSE_BENCHMARKS) {
    const actual = monthlyByCategory[rule.category] || 0;
    if (actual <= 0) continue;

    const overcharge = actual - rule.marketAvg;
    const pct = rule.marketAvg > 0 ? (overcharge / rule.marketAvg) * 100 : 0;

    if (pct > 25 && overcharge > 100) { // >25% above market + at least ₪100
      alerts.push({
        id: `bench-${rule.category}`,
        icon: rule.icon,
        title: `${rule.label} — מעל ממוצע השוק`,
        body: `אתה משלם ${fmt(actual)}/חודש על ${rule.label}. ממוצע השוק: ${fmt(rule.marketAvg)}. פוטנציאל חיסכון שנתי: ${fmt(overcharge * 12)}.`,
        severity: overcharge > 500 ? "warning" : "info",
        impact: `−${fmt(overcharge * 12)}/שנה`,
        ctaLabel: "לתקציב",
        ctaHref: "/budget",
      });
    }
  }

  return alerts;
}

/* ─── Cross-Account Exposure Alert ─── */

/**
 * Warns about concentration risk: >60% in a single index/currency.
 */
export function crossAccountExposureAlerts(
  exposure: ExposureSlice[],
): SmartAlert[] {
  const total = exposure.reduce((s, e) => s + e.total, 0);
  if (total <= 0) return [];

  const alerts: SmartAlert[] = [];

  for (const e of exposure) {
    const pct = (e.total / total) * 100;
    if (pct > 60) {
      alerts.push({
        id: `concentration-${e.index}`,
        icon: "warning",
        title: `ריכוז גבוה — ${e.index}`,
        body: `${pct.toFixed(0)}% מההון שלך חשוף ל-${e.index} על פני כל החשבונות. שקול פיזור לצמצום סיכון.`,
        severity: pct > 75 ? "critical" : "warning",
        ctaLabel: "לדף השקעות",
        ctaHref: "/investments",
      });
    }
  }

  // USD concentration check
  const usdExposed = exposure
    .filter(e => ["S&P 500", "שווקים מתעוררים", "קריפטו"].includes(e.index))
    .reduce((s, e) => s + e.total, 0);
  const usdPct = (usdExposed / total) * 100;
  if (usdPct > 70) {
    alerts.push({
      id: "usd-concentration",
      icon: "currency_exchange",
      title: "חשיפת מטבע — דולר",
      body: `~${usdPct.toFixed(0)}% מההון שלך חשוף לדולר/מט"ח. ירידה של 10% בשער עלולה לפגוע בשווי ב-${fmt(Math.round(usdExposed * 0.1))}.`,
      severity: "warning",
    });
  }

  return alerts;
}

/* ─── Card / Instrument Alerts ─── */

/**
 * Alerts for inactive credit cards or accounts with unnecessary fees.
 */
export function instrumentAlerts(
  instruments: FinancialInstrument[],
): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  const cards = instruments.filter(i => i.type === "credit_card");
  if (cards.length > 2) {
    alerts.push({
      id: "too-many-cards",
      icon: "credit_card_off",
      title: "ריבוי כרטיסי אשראי",
      body: `יש לך ${cards.length} כרטיסים פעילים. בדוק אם כולם בשימוש — דמי כרטיס מיותרים יכולים לעלות ₪240-480 בשנה.`,
      severity: "info",
      impact: `~₪${cards.length > 3 ? "480" : "240"}/שנה`,
    });
  }

  const lowBalanceBanks = instruments.filter(i => i.type === "bank" && i.balance != null && i.balance < 1000);
  for (const b of lowBalanceBanks) {
    alerts.push({
      id: `dormant-${b.id}`,
      icon: "account_balance",
      title: `חשבון לא פעיל — ${b.name}`,
      body: `יתרה נמוכה (${fmt(b.balance || 0)}) ב-${b.institution}. שקול סגירה או איחוד עם חשבון ראשי.`,
      severity: "info",
    });
  }

  return alerts;
}

/* ─── Dynamic Rule of 300 ─── */

/**
 * Rule of 300 dynamically adjusted for inflation, management fees,
 * and current cashflow trajectory.
 * Base: monthly expenses × 300
 * Adjusted: factor grows when real SWR drops below 4%.
 */
export function dynamicFreedomNumber(
  monthlyExpenses: number,
  inflationRate: number,
  managementFees: number,
): { freedomNumber: number; multiplier: number; realSWR: number } {
  // Nominal SWR = 4%, but real SWR accounts for inflation + fees
  const nominalSWR = 0.04;
  const realSWR = nominalSWR - inflationRate - managementFees;
  // If real SWR is lower, you need MORE capital → higher multiplier
  const multiplier = realSWR > 0.005 ? 1 / (realSWR * 12) : 500; // cap at 500
  const freedomNum = monthlyExpenses * multiplier;

  return {
    freedomNumber: freedomNum,
    multiplier: Math.round(multiplier),
    realSWR,
  };
}

/* ─── Net After-Tax Value ─── */

/**
 * Calculate net-of-tax value for securities portfolio.
 * RSU: Section 102 route → ordinary income tax on vest, then CGT on excess.
 * Regular securities: 25% CGT on gains.
 */
export function netAfterTaxValue(
  marketValue: number,
  costBasis: number,
  kind: string,
): { netValue: number; taxProvision: number } {
  const gain = Math.max(0, marketValue - costBasis);

  if (kind === "rsu") {
    // Section 102 capital track: 25% on ALL gain (from grant price)
    const tax = gain * 0.25;
    return { netValue: marketValue - tax, taxProvision: tax };
  }
  if (kind === "option") {
    // Similar to RSU but may have strike price component
    const tax = gain * 0.25;
    return { netValue: marketValue - tax, taxProvision: tax };
  }
  // Standard securities: 25% CGT
  const tax = gain * 0.25;
  return { netValue: marketValue - tax, taxProvision: tax };
}

/* ─── Aggregate all alerts ─── */

export function generateAllAlerts(ctx: {
  liquidAssets: Asset[];
  monthlyExpenses: number;
  monthlyByCategory: Record<string, number>;
  exposure: ExposureSlice[];
  instruments: FinancialInstrument[];
}): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  const idle = detectIdleCash(ctx.liquidAssets, ctx.monthlyExpenses);
  if (idle) alerts.push(idle);

  alerts.push(...benchmarkExpenses(ctx.monthlyByCategory));
  alerts.push(...crossAccountExposureAlerts(ctx.exposure));
  alerts.push(...instrumentAlerts(ctx.instruments));

  // Sort: critical → warning → opportunity → info
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}

/* ─── helpers ─── */
function fmt(v: number): string {
  return "₪" + Math.abs(Math.round(v)).toLocaleString("he-IL");
}
