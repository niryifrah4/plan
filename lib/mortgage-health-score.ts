/**
 * ═══════════════════════════════════════════════════════════
 *  Mortgage Health Score — 0..100 with sub-scores
 * ═══════════════════════════════════════════════════════════
 *
 * Phase 6 (2026-05-21). Single number a couple can hold onto: "המשכנתא שלכם
 * בציון 62 — בואו נדבר". Backed by 5 weighted dimensions so the user can see
 * WHERE points were lost. Pure function; UI does the rendering.
 *
 * Weights (sum to 100):
 *   - rate exposure         25  (mix diversification — too much Prime = penalty)
 *   - term vs retirement    20  (mortgage ending after retirement age = penalty)
 *   - rate vs market        20  (weighted avg rate above BoI average = penalty)
 *   - LTV                   20  (sweet spot 30-60%)
 *   - payment % of income   15  (DTI-style)
 *
 * When data for a dimension is missing (e.g. no income entered), that sub-
 * score is omitted and the total is rescaled to the available weights. So a
 * fresh-onboarded user without income gets a partial-but-meaningful score
 * instead of "—".
 */

import type { DebtData, MortgageData } from "./debt-store";
import { effectiveTrackRate, getAllMortgageTracks } from "./debt-store";
import type { Assumptions } from "./assumptions";
import type { Property } from "./realestate-store";

export interface HealthSubScore {
  /** Identifier — UI uses this for the breakdown row. */
  key:
    | "rate_exposure"
    | "term_vs_retirement"
    | "rate_vs_market"
    | "ltv"
    | "payment_share";
  /** Hebrew label for the row. */
  label: string;
  /** 0..weight (after applying the dimension's rules). */
  score: number;
  /** Max points this dimension can contribute. */
  weight: number;
  /** Short one-liner for the breakdown ("70% פריים — חשיפה גבוהה לעליית ריבית"). */
  note: string;
  /** "good" | "ok" | "bad" → drives color in the UI. */
  status: "good" | "ok" | "bad";
}

export interface MortgageHealthScore {
  /** 0..100 overall (rescaled when some dimensions are missing). */
  total: number;
  /** "good" | "ok" | "bad" for headline color/copy. */
  band: "good" | "ok" | "bad";
  subScores: HealthSubScore[];
  /** Dimensions skipped because of missing data — UI may surface a CTA. */
  missing: string[];
}

export interface HealthInput {
  debt: DebtData;
  assumptions: Assumptions;
  properties: Property[];
  monthlyNetIncome: number;
}

function band(score: number, weight: number): "good" | "ok" | "bad" {
  const ratio = weight === 0 ? 0 : score / weight;
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.5) return "ok";
  return "bad";
}

function overallBand(total: number): "good" | "ok" | "bad" {
  if (total >= 75) return "good";
  if (total >= 55) return "ok";
  return "bad";
}

/* ── Sub-score: rate exposure (25 pts) ─────────────────────────────── */

function rateExposureScore(debt: DebtData): HealthSubScore | null {
  const tracks = getAllMortgageTracks(debt);
  const total = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  if (total <= 0) return null;
  const variable = tracks.reduce((s, t) => {
    const isPrime = typeof t.margin === "number" || /פריים|prime/i.test(t.name || "");
    const isVariable = /משתנה|variable/i.test(t.name || "");
    return s + (isPrime || isVariable ? (t.remainingBalance || 0) : 0);
  }, 0);
  const share = variable / total;
  // Penalty curve: 0%-40% variable → full 25. 100% → 5.
  let score: number;
  if (share <= 0.4) score = 25;
  else if (share <= 0.6) score = 22;
  else if (share <= 0.75) score = 16;
  else if (share <= 0.9) score = 10;
  else score = 5;
  const note =
    share <= 0.4
      ? `תמהיל מאוזן — ${Math.round(share * 100)}% במסלולים תלויי-פריים`
      : `${Math.round(share * 100)}% במסלולים תלויי-פריים/משתנים — חשיפה לעליית ריבית`;
  return {
    key: "rate_exposure",
    label: "פיזור חשיפה לריבית",
    score,
    weight: 25,
    note,
    status: band(score, 25),
  };
}

/* ── Sub-score: term vs retirement (20 pts) ────────────────────────── */

function termVsRetirementScore(
  debt: DebtData,
  a: Assumptions
): HealthSubScore | null {
  if (!a.currentAge || !a.retirementAge || a.retirementAge <= a.currentAge) return null;
  const tracks = getAllMortgageTracks(debt);
  if (tracks.length === 0) return null;
  const retirementYear = new Date().getFullYear() + (a.retirementAge - a.currentAge);
  const latestEnd = tracks
    .map((t) => (t.endDate ? parseInt(t.endDate.split("-")[0], 10) : null))
    .filter((y): y is number => y !== null && Number.isFinite(y))
    .reduce((max, y) => Math.max(max, y), 0);
  if (!latestEnd) return null;
  const yearsPast = latestEnd - retirementYear;
  let score: number;
  let note: string;
  if (yearsPast <= -3) {
    score = 20;
    note = `מסתיים ${Math.abs(yearsPast)} שנים לפני גיל פרישה`;
  } else if (yearsPast <= 0) {
    score = 18;
    note = `מסתיים בערך בגיל הפרישה`;
  } else if (yearsPast <= 3) {
    score = 13;
    note = `מסתיים ${yearsPast} שנים אחרי גיל פרישה — מתחיל להעמיס על קצבה`;
  } else if (yearsPast <= 8) {
    score = 7;
    note = `מסתיים ${yearsPast} שנים אחרי גיל פרישה — מצב בעייתי`;
  } else {
    score = 2;
    note = `מסתיים ${yearsPast} שנים אחרי גיל פרישה — קריטי, סביר שבנק יסרב מיחזור`;
  }
  return {
    key: "term_vs_retirement",
    label: "תקופה מול גיל פרישה",
    score,
    weight: 20,
    note,
    status: band(score, 20),
  };
}

/* ── Sub-score: rate vs market (20 pts) ────────────────────────────── */

function rateVsMarketScore(
  debt: DebtData,
  a: Assumptions
): HealthSubScore | null {
  const tracks = getAllMortgageTracks(debt);
  const totalBalance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  if (totalBalance <= 0) return null;
  const weightedRate =
    tracks.reduce(
      (s, t) => s + effectiveTrackRate(t, a.primeRate) * (t.remainingBalance || 0),
      0
    ) / totalBalance;
  const market = a.avgMortgageRate;
  if (!market) return null;
  const gap = weightedRate - market;
  let score: number;
  let note: string;
  if (gap <= -0.005) {
    score = 20;
    note = `ריבית משוקללת ${(weightedRate * 100).toFixed(2)}% — מתחת לממוצע השוק`;
  } else if (gap <= 0.005) {
    score = 18;
    note = `ריבית משוקללת ${(weightedRate * 100).toFixed(2)}% — בקו עם השוק`;
  } else if (gap <= 0.015) {
    score = 13;
    note = `ריבית משוקללת ${(weightedRate * 100).toFixed(2)}% — מעל השוק ב-${(gap * 100).toFixed(2)}%`;
  } else if (gap <= 0.03) {
    score = 8;
    note = `ריבית משוקללת ${(weightedRate * 100).toFixed(2)}% — גבוהה משמעותית, מועמדת למיחזור`;
  } else {
    score = 3;
    note = `ריבית משוקללת ${(weightedRate * 100).toFixed(2)}% — גבוהה מאוד, מיחזור דחוף`;
  }
  return {
    key: "rate_vs_market",
    label: "ריבית מול שוק",
    score,
    weight: 20,
    note,
    status: band(score, 20),
  };
}

/* ── Sub-score: LTV (20 pts) ───────────────────────────────────────── */

function ltvScore(
  mortgages: MortgageData[],
  properties: Property[]
): HealthSubScore | null {
  // Compute weighted LTV across all mortgages with a known property value.
  let totalBalance = 0;
  let totalValue = 0;
  for (const m of mortgages) {
    const property = m.propertyId ? properties.find((p) => p.id === m.propertyId) : undefined;
    const propValue = property?.currentValue || m.propertyValue;
    if (!propValue) continue;
    const bal = (m.tracks || []).reduce((s, t) => s + (t.remainingBalance || 0), 0);
    if (!bal) continue;
    totalBalance += bal;
    totalValue += propValue;
  }
  if (totalValue <= 0) return null;
  const ltv = totalBalance / totalValue;
  let score: number;
  let note: string;
  // Sweet spot: 30%-60%. Below 30% = unused equity (mild penalty). Above 75% = ceiling risk.
  if (ltv < 0.2) {
    score = 14;
    note = `LTV ${Math.round(ltv * 100)}% — נמוך, יש הון בלתי-ממונף`;
  } else if (ltv < 0.6) {
    score = 20;
    note = `LTV ${Math.round(ltv * 100)}% — בטווח המוצלח`;
  } else if (ltv < 0.75) {
    score = 16;
    note = `LTV ${Math.round(ltv * 100)}% — סביר, מתחת לתקרה הרגולטורית`;
  } else if (ltv < 0.85) {
    score = 9;
    note = `LTV ${Math.round(ltv * 100)}% — קרוב לתקרה, ירידה בשווי תיצור בעיה`;
  } else {
    score = 3;
    note = `LTV ${Math.round(ltv * 100)}% — מעל התקרה הרגולטורית`;
  }
  return {
    key: "ltv",
    label: "יחס חוב לערך נכס (LTV)",
    score,
    weight: 20,
    note,
    status: band(score, 20),
  };
}

/* ── Sub-score: payment share (15 pts) ─────────────────────────────── */

function paymentShareScore(
  debt: DebtData,
  monthlyNetIncome: number
): HealthSubScore | null {
  if (monthlyNetIncome <= 0) return null;
  const tracks = getAllMortgageTracks(debt);
  const monthly = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  if (monthly <= 0) return null;
  const share = monthly / monthlyNetIncome;
  let score: number;
  let note: string;
  if (share < 0.2) {
    score = 15;
    note = `החזר משכנתא ${Math.round(share * 100)}% מההכנסה נטו — בטוח`;
  } else if (share < 0.3) {
    score = 12;
    note = `החזר משכנתא ${Math.round(share * 100)}% מההכנסה — תחת הרף המומלץ של 30%`;
  } else if (share < 0.4) {
    score = 7;
    note = `החזר משכנתא ${Math.round(share * 100)}% מההכנסה — מעל הרף הקלאסי`;
  } else {
    score = 2;
    note = `החזר משכנתא ${Math.round(share * 100)}% מההכנסה — קריטי`;
  }
  return {
    key: "payment_share",
    label: "החזר חודשי כאחוז מההכנסה",
    score,
    weight: 15,
    note,
    status: band(score, 15),
  };
}

/* ── Main ────────────────────────────────────────────────────────── */

export function computeMortgageHealthScore(input: HealthInput): MortgageHealthScore {
  const { debt, assumptions, properties, monthlyNetIncome } = input;
  const subScores: HealthSubScore[] = [];
  const missing: string[] = [];

  const exposure = rateExposureScore(debt);
  if (exposure) subScores.push(exposure);

  const term = termVsRetirementScore(debt, assumptions);
  if (term) subScores.push(term);
  else if (!assumptions.currentAge) missing.push("השלם גיל בעמוד הנחות יסוד");

  const rateMarket = rateVsMarketScore(debt, assumptions);
  if (rateMarket) subScores.push(rateMarket);

  const ltv = ltvScore(debt.mortgages || [], properties);
  if (ltv) subScores.push(ltv);
  else if ((debt.mortgages || []).length > 0) missing.push("הוסף שווי נכס כדי לקבל ציון LTV");

  const payShare = paymentShareScore(debt, monthlyNetIncome);
  if (payShare) subScores.push(payShare);
  else if (monthlyNetIncome <= 0) missing.push("הוסף הכנסה כדי לחשב יחס תשלום");

  // Rescale: total = sum(scores) / sum(weights) × 100. So a partial-data user
  // still gets a 0..100 number, just based on fewer dimensions.
  const totalWeight = subScores.reduce((s, ss) => s + ss.weight, 0);
  const totalRaw = subScores.reduce((s, ss) => s + ss.score, 0);
  const total = totalWeight > 0 ? Math.round((totalRaw / totalWeight) * 100) : 0;

  return {
    total,
    band: overallBand(total),
    subScores,
    missing,
  };
}
