/**
 * Property sale simulator — projects net cash proceeds at a future date.
 *
 * Built 2026-05-02 per Nir: when planning to swap a property, the user
 * needs a clear view of:
 *   - what the property will be worth at the planned sale date
 *   - how much mortgage will be left then (amortization)
 *   - tax (mas shevach) status
 *   - selling fees (broker + lawyer + transaction costs)
 *   - **net cash in hand** after all deductions
 *
 * Pure function — no React, no storage. Returns a structured DTO that the
 * UI renders.
 */

import { pmt } from "./_shared/financial-math";
import type { Property } from "./realestate-store";
import { propertyTaxStatus } from "./realestate-store";

export interface SaleSimInputs {
  /** Years from today to the planned sale (decimal allowed, e.g. 1.5). */
  yearsToSale: number;
  /** Annual appreciation override (decimal, e.g. 0.03 for 3%). Defaults to property's setting. */
  annualAppreciationOverride?: number;
  /** Selling fees as a fraction of sale price (broker + lawyer + admin).
   *  Israeli market average ~5% (2% broker each side + 0.5% lawyer + misc). */
  sellingFeesPct?: number;
  /** Effective mortgage interest rate for amortization. Default 5%. */
  mortgageRateOverride?: number;
}

export interface SaleSimOutputs {
  /** Date of planned sale (ISO YYYY-MM-DD). */
  saleDate: string;
  /** Years held at sale (purchaseDate → saleDate). */
  yearsHeldAtSale: number;
  /** Projected sale price in nominal ₪. */
  projectedSalePrice: number;
  /** Mortgage balance still owed at sale date in ₪. */
  mortgageBalanceAtSale: number;
  /** Selling fees in ₪ (sellingFeesPct × salePrice). */
  sellingFees: number;
  /** Tax status + estimated tax in ₪. */
  taxStatus: "exempt" | "overlap" | "taxable" | "unknown" | "exempt_partial";
  taxLabel: string;
  estimatedTax: number;
  /** Net cash to seller after mortgage + fees + tax. */
  netCashProceeds: number;
  /** Capital gain (sale - purchase price). */
  capitalGain: number;
  /** Annualized return on the equity invested at purchase (rough). */
  estimatedROI: number;
}

/** Israeli capital-gains tax on RE — 25% on the real (inflation-adjusted) gain.
 *  We approximate using nominal gain since we don't track CPI here. Conservative. */
const CAPITAL_GAINS_RATE_NON_PRIMARY = 0.25;

export function simulatePropertySale(
  prop: Property,
  allProperties: Property[],
  inputs: SaleSimInputs,
): SaleSimOutputs {
  const yearsToSale = Math.max(0, inputs.yearsToSale);
  const appreciation = inputs.annualAppreciationOverride ?? (prop.annualAppreciation ?? 0.03);
  const sellingFeesPct = inputs.sellingFeesPct ?? 0.05;
  const mortgageRate = inputs.mortgageRateOverride ?? 0.05;

  // ── 1. Sale price projection ──
  const projectedSalePrice = Math.round(
    (prop.currentValue || 0) * Math.pow(1 + appreciation, yearsToSale),
  );

  // ── 2. Mortgage balance at sale date ──
  // Use PMT + amortization. We need the original loan amount + remaining
  // months to compute today's balance forward, then advance years.
  // Shortcut: PV of remaining payments at sale date.
  const monthlyPayment = prop.monthlyMortgage || 0;
  const currentBalance = prop.mortgageBalance || 0;
  const monthlyRate = mortgageRate / 12;
  let mortgageBalanceAtSale = 0;

  if (currentBalance > 0 && monthlyPayment > 0) {
    // Calculate remaining months at current pace.
    // Using PMT formula reversed: months = -ln(1 - (P*r/PMT)) / ln(1+r)
    const ratio = (currentBalance * monthlyRate) / monthlyPayment;
    const monthsRemaining = ratio < 1 && ratio > 0
      ? -Math.log(1 - ratio) / Math.log(1 + monthlyRate)
      : 360; // fallback to 30y if math degenerate
    const monthsToSale = yearsToSale * 12;

    if (monthsToSale >= monthsRemaining) {
      mortgageBalanceAtSale = 0; // mortgage paid off before sale
    } else {
      // Balance after `monthsToSale` payments:
      // B(n) = P*(1+r)^n - PMT*((1+r)^n - 1)/r
      const factor = Math.pow(1 + monthlyRate, monthsToSale);
      mortgageBalanceAtSale = Math.max(
        0,
        currentBalance * factor - monthlyPayment * ((factor - 1) / monthlyRate),
      );
    }
  } else {
    mortgageBalanceAtSale = currentBalance; // no payments → balance unchanged
  }
  mortgageBalanceAtSale = Math.round(mortgageBalanceAtSale);

  // ── 3. Selling fees ──
  const sellingFees = Math.round(projectedSalePrice * sellingFeesPct);

  // ── 4. Tax ──
  const taxInfo = propertyTaxStatus(prop, allProperties);
  let estimatedTax = 0;
  let taxStatus: SaleSimOutputs["taxStatus"] = taxInfo.status;
  let taxLabel = taxInfo.message;

  // Capital gain (nominal — conservative since we don't index for inflation)
  const purchasePrice = prop.purchasePrice || 0;
  const capitalGain = Math.max(0, projectedSalePrice - purchasePrice);

  if (taxInfo.status === "taxable" && capitalGain > 0) {
    estimatedTax = Math.round(capitalGain * CAPITAL_GAINS_RATE_NON_PRIMARY);
  } else if (taxInfo.status === "exempt" && projectedSalePrice > 4_500_000) {
    // Partial exemption above ceiling — simplified: tax the portion above ₪4.5M
    // at the standard rate, attributed proportionally to the gain.
    const taxablePortion = (projectedSalePrice - 4_500_000) / projectedSalePrice;
    estimatedTax = Math.round(capitalGain * taxablePortion * CAPITAL_GAINS_RATE_NON_PRIMARY);
    taxStatus = "exempt_partial";
    taxLabel = `פטור חלקי — חייב על הסכום מעל ₪4.5M`;
  }

  // ── 5. Net cash ──
  const netCashProceeds = Math.round(
    projectedSalePrice - mortgageBalanceAtSale - sellingFees - estimatedTax,
  );

  // ── 6. ROI on original equity (purchase price - original loan) ──
  // We approximate "original equity invested" as purchasePrice - currentBalance
  // (since we don't track the original loan amount separately).
  const originalEquity = Math.max(1, purchasePrice - currentBalance);
  const totalReturn = netCashProceeds - originalEquity;
  const yearsHeld = (() => {
    if (!prop.purchaseDate) return yearsToSale;
    const ms = new Date(prop.purchaseDate.length === 7
      ? prop.purchaseDate + "-01"
      : prop.purchaseDate
    ).getTime();
    const years = (Date.now() - ms) / (1000 * 60 * 60 * 24 * 365.25) + yearsToSale;
    return Math.max(0.1, years);
  })();
  const estimatedROI = originalEquity > 0
    ? (Math.pow(netCashProceeds / originalEquity, 1 / yearsHeld) - 1) * 100
    : 0;

  // Sale date as ISO
  const saleDate = new Date(Date.now() + yearsToSale * 365.25 * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);

  return {
    saleDate,
    yearsHeldAtSale: yearsHeld,
    projectedSalePrice,
    mortgageBalanceAtSale,
    sellingFees,
    taxStatus,
    taxLabel,
    estimatedTax,
    netCashProceeds,
    capitalGain,
    estimatedROI,
  };
}

// pmt is imported above to ensure financial-math link is intact (used elsewhere).
void pmt;
