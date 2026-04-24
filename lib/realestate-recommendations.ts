/**
 * Real Estate Recommendations Engine
 * Generates actionable insights per property based on financial metrics.
 */

import type { Property } from "./realestate-store";
import { loadAssumptions } from "./assumptions";
import { loadDebtData, type MortgageTrack } from "./debt-store";

export interface RERecommendation {
  id: string;
  propertyId: string;
  propertyName: string;
  icon: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info" | "opportunity";
  impact?: string;
}

/**
 * Generate recommendations for all properties.
 */
export function generateRERecommendations(properties: Property[]): RERecommendation[] {
  const recs: RERecommendation[] = [];
  const assumptions = loadAssumptions();
  const debtData = loadDebtData();
  const mortgageTracks = debtData.mortgage?.tracks || [];

  for (const prop of properties) {
    const rent = prop.monthlyRent ?? 0;
    const expenses = prop.monthlyExpenses ?? 0;
    const mtg = prop.monthlyMortgage ?? 0;
    const mtgBalance = prop.mortgageBalance ?? 0;
    const value = prop.currentValue || 0;
    const noi = rent - expenses;
    const cashflow = noi - mtg;
    const dscr = mtg > 0 ? noi / mtg : 0;
    const equity = value - mtgBalance;
    const equityPct = value > 0 ? equity / value : 0;
    const netYield = value > 0 ? ((noi * 12) / value) * 100 : 0;

    // Find linked mortgage tracks for interest rate check
    const linkedTracks = mortgageTracks.filter(t =>
      t.name?.includes(prop.name) || prop.mortgageLinked
    );

    // 1. Negative cashflow — DSCR < 1.0
    if (mtg > 0 && dscr < 1.0 && rent > 0) {
      const deficit = Math.round(mtg - noi);
      recs.push({
        id: `neg-cf-${prop.id}`,
        propertyId: prop.id,
        propertyName: prop.name,
        icon: "trending_down",
        title: "תזרים שלילי על הנכס",
        detail: `שכ״ד לא מכסה החזרים. גרעון חודשי: ₪${deficit.toLocaleString()}. שקול העלאת שכ״ד או הפחתת הוצאות.`,
        severity: "critical",
        impact: `₪${(deficit * 12).toLocaleString()}/שנה`,
      });
    }

    // 2. High interest rate — check if mortgage rate > boiRate + 1%
    if (linkedTracks.length > 0) {
      const threshold = assumptions.boiRate + 0.01;
      for (const track of linkedTracks) {
        if (track.interestRate > threshold) {
          const saving = Math.round(
            (track.remainingBalance * (track.interestRate - assumptions.boiRate)) / 12
          );
          recs.push({
            id: `high-rate-${prop.id}-${track.id}`,
            propertyId: prop.id,
            propertyName: prop.name,
            icon: "percent",
            title: "ריבית גבוהה — שקול מיחזור",
            detail: `מסלול "${track.name}" בריבית ${(track.interestRate * 100).toFixed(1)}%. ריבית בנק ישראל: ${(assumptions.boiRate * 100).toFixed(1)}%.`,
            severity: "warning",
            impact: `חיסכון ~₪${saving.toLocaleString()}/חודש`,
          });
        }
      }
    }

    // 3. Equity extraction opportunity — equity > 50% & low mortgage
    if (equityPct > 0.5 && value > 500_000) {
      const extractable = Math.round(value * 0.5 - mtgBalance);
      if (extractable > 100_000) {
        recs.push({
          id: `equity-ext-${prop.id}`,
          propertyId: prop.id,
          propertyName: prop.name,
          icon: "account_balance",
          title: "הוצאת הון מהקירות",
          detail: `${Math.round(equityPct * 100)}% הון עצמי בנכס. ניתן להוציא עד ₪${extractable.toLocaleString()} בהלוואה עד 50% LTV.`,
          severity: "opportunity",
          impact: `₪${extractable.toLocaleString()} הון פנוי`,
        });
      }
    }

    // 4. Investment property with no rent defined
    if (prop.type === "investment" && rent === 0) {
      recs.push({
        id: `no-rent-${prop.id}`,
        propertyId: prop.id,
        propertyName: prop.name,
        icon: "edit",
        title: "חסרה הכנסה משכ״ד",
        detail: "נכס להשקעה ללא הכנסה מוגדרת. הגדר שכ״ד חודשי לחישוב תשואה ותזרים.",
        severity: "warning",
      });
    }

    // 5. Unleveraged high-value property — no mortgage on property > 1M
    if (mtgBalance === 0 && value > 1_000_000 && prop.type !== "residence") {
      recs.push({
        id: `no-leverage-${prop.id}`,
        propertyId: prop.id,
        propertyName: prop.name,
        icon: "rocket_launch",
        title: "נכס ללא מינוף",
        detail: `שווי ₪${(value / 1_000_000).toFixed(1)}M ללא משכנתא. שקול מינוף לרכישת נכס נוסף או השקעה חלופית.`,
        severity: "opportunity",
      });
    }

    // 6. Low net yield — under 3%
    if (prop.type === "investment" && rent > 0 && netYield < 3 && netYield > 0) {
      recs.push({
        id: `low-yield-${prop.id}`,
        propertyId: prop.id,
        propertyName: prop.name,
        icon: "speed",
        title: "תשואה נטו נמוכה",
        detail: `תשואה שנתית ${netYield.toFixed(1)}% — מתחת ל-3%. שקול שיפוץ, העלאת שכ״ד או מכירה.`,
        severity: "info",
      });
    }

    // 7. Missing expenses on investment property with rent
    if (prop.type === "investment" && rent > 0 && expenses === 0) {
      recs.push({
        id: `no-expenses-${prop.id}`,
        propertyId: prop.id,
        propertyName: prop.name,
        icon: "receipt_long",
        title: "חסרות הוצאות",
        detail: "הגדר הוצאות (ועד בית, ארנונה, ביטוח, תחזוקה) לקבלת תשואה ריאלית.",
        severity: "warning",
      });
    }
  }

  return recs;
}
