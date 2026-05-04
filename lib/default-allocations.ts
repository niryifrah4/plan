/**
 * ═══════════════════════════════════════════════════════════
 *  Default Allocations — נכסים לא-פנסיוניים
 * ═══════════════════════════════════════════════════════════
 *
 * אלוקציות קבועות לנכסים כמו עו"ש, נדל"ן, מזומן, מניות בודדות.
 * משמש את allocation-engine כשנכס אינו מקושר למאגר מסלולים.
 */

import type { FundAllocation } from "./fund-registry";

export const DEFAULT_ALLOCATIONS: Record<string, FundAllocation> = {
  bank_account: {
    currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
    geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
    assetClass: { equity: 0, bonds: 0, cash: 100, alternative: 0 },
    liquidity: "immediate",
  },
  usd_deposit: {
    currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
    geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
    assetClass: { equity: 0, bonds: 0, cash: 100, alternative: 0 },
    liquidity: "conditional",
    liquidityNote: "לפי תנאי הפיקדון",
  },
  realestate_il: {
    currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
    geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
    assetClass: { equity: 0, bonds: 0, cash: 0, alternative: 0 },
    liquidity: "locked",
    liquidityNote: 'נדל"ן — מימוש 3-12 חודשים',
  },
  bitcoin: {
    currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
    geography: { IL: 0, US: 0, EU: 0, EM: 0, OTHER: 100 },
    assetClass: { equity: 0, bonds: 0, cash: 0, alternative: 100 },
    liquidity: "immediate",
  },
  us_stock: {
    currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
    geography: { IL: 0, US: 100, EU: 0, EM: 0, OTHER: 0 },
    assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
    liquidity: "immediate",
  },
  il_stock: {
    currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
    geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
    assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
    liquidity: "immediate",
  },
  gov_bond_il: {
    currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
    geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
    assetClass: { equity: 0, bonds: 100, cash: 0, alternative: 0 },
    liquidity: "immediate",
  },
  gold: {
    currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
    geography: { IL: 0, US: 0, EU: 0, EM: 0, OTHER: 100 },
    assetClass: { equity: 0, bonds: 0, cash: 0, alternative: 100 },
    liquidity: "immediate",
  },
};
