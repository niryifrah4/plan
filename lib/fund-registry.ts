/**
 * ═══════════════════════════════════════════════════════════
 *  Fund Registry — 76 מסלולים מ-8 גופים מוסדיים
 * ═══════════════════════════════════════════════════════════
 *
 * נתונים נכונים לפברואר 2026.
 * כל מסלול כולל אלוקציה רב-ממדית (מטבע, גיאוגרפיה, אפיק, נזילות).
 */

/* ── Types ── */

export interface FundAllocation {
  currency: { ILS: number; USD: number; EUR: number; OTHER: number };
  geography: { IL: number; US: number; EU: number; EM: number; OTHER: number };
  assetClass: { equity: number; bonds: number; cash: number; alternative: number };
  liquidity: "immediate" | "conditional" | "locked";
  liquidityNote?: string;
}

export interface RegisteredFund {
  id: string;
  provider: string;
  name: string;
  fundNumber: number;
  type: "pension" | "gemel" | "hishtalmut" | "bituach";
  riskLevel: "high" | "medium" | "low";
  equityExposure: number;
  foreignExposure: number;
  currencyExposure: number;
  mgmtFee: number;
  allocation: FundAllocation;
  lastUpdated: string;
}

/* ── Registry ── */

export const FUND_REGISTRY: RegisteredFund[] = [

  // ═══════════════════════════════════════
  // מיטב — 12 מסלולים
  // ═══════════════════════════════════════

  {
    id: "meitav_7860", provider: "מיטב", name: "מניות", fundNumber: 7860,
    type: "gemel", riskLevel: "high",
    equityExposure: 97.39, foreignExposure: 73.4, currencyExposure: 25.1, mgmtFee: 0.58,
    allocation: {
      currency: { ILS: 75, USD: 18, EUR: 4, OTHER: 3 },
      geography: { IL: 27, US: 45, EU: 15, EM: 8, OTHER: 5 },
      assetClass: { equity: 97, bonds: 0, cash: 3, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7867", provider: "מיטב", name: "עוקב מדדי מניות", fundNumber: 7867,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.64, foreignExposure: 99.76, currencyExposure: 3.13, mgmtFee: 0.63,
    allocation: {
      currency: { ILS: 97, USD: 2, EUR: 1, OTHER: 0 },
      geography: { IL: 0, US: 55, EU: 20, EM: 15, OTHER: 10 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_13259", provider: "מיטב", name: "עוקב מדד S&P500", fundNumber: 13259,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.65, foreignExposure: 99.0, currencyExposure: 99.48, mgmtFee: 0.55,
    allocation: {
      currency: { ILS: 1, USD: 99, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 99, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_15349", provider: "מיטב", name: "משולב סחיר", fundNumber: 15349,
    type: "gemel", riskLevel: "high",
    equityExposure: 97.43, foreignExposure: 3.54, currencyExposure: 5.99, mgmtFee: 0.23,
    allocation: {
      currency: { ILS: 94, USD: 4, EUR: 1, OTHER: 1 },
      geography: { IL: 96, US: 2, EU: 1, EM: 0, OTHER: 1 },
      assetClass: { equity: 97, bonds: 1, cash: 2, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_15350", provider: "מיטב", name: "מניות סחיר", fundNumber: 15350,
    type: "gemel", riskLevel: "high",
    equityExposure: 98.13, foreignExposure: 99.38, currencyExposure: 95.17, mgmtFee: 0.23,
    allocation: {
      currency: { ILS: 5, USD: 70, EUR: 15, OTHER: 10 },
      geography: { IL: 1, US: 60, EU: 20, EM: 12, OTHER: 7 },
      assetClass: { equity: 98, bonds: 0, cash: 2, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_14270", provider: "מיטב", name: "קיימות", fundNumber: 14270,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.32, foreignExposure: 99.32, currencyExposure: 3.58, mgmtFee: 0.52,
    allocation: {
      currency: { ILS: 96, USD: 3, EUR: 1, OTHER: 0 },
      geography: { IL: 1, US: 55, EU: 25, EM: 10, OTHER: 9 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7978", provider: "מיטב", name: "כללי", fundNumber: 7978,
    type: "gemel", riskLevel: "medium",
    equityExposure: 46.56, foreignExposure: 45.44, currencyExposure: 18.65, mgmtFee: 0.60,
    allocation: {
      currency: { ILS: 81, USD: 13, EUR: 3, OTHER: 3 },
      geography: { IL: 55, US: 25, EU: 10, EM: 5, OTHER: 5 },
      assetClass: { equity: 47, bonds: 38, cash: 9, alternative: 6 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7863", provider: "מיטב", name: "הלכה", fundNumber: 7863,
    type: "gemel", riskLevel: "medium",
    equityExposure: 46.65, foreignExposure: 36.31, currencyExposure: 15.05, mgmtFee: 0.67,
    allocation: {
      currency: { ILS: 85, USD: 10, EUR: 3, OTHER: 2 },
      geography: { IL: 64, US: 20, EU: 8, EM: 5, OTHER: 3 },
      assetClass: { equity: 47, bonds: 45, cash: 5, alternative: 3 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7979", provider: "מיטב", name: "עוקב מדדים גמיש", fundNumber: 7979,
    type: "gemel", riskLevel: "medium",
    equityExposure: 50.75, foreignExposure: 100, currencyExposure: 52.87, mgmtFee: 0.64,
    allocation: {
      currency: { ILS: 47, USD: 35, EUR: 10, OTHER: 8 },
      geography: { IL: 0, US: 50, EU: 25, EM: 15, OTHER: 10 },
      assetClass: { equity: 51, bonds: 43, cash: 6, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7980", provider: "מיטב", name: "אשראי ואג\"ח עם מניות", fundNumber: 7980,
    type: "gemel", riskLevel: "low",
    equityExposure: 23.80, foreignExposure: 32.33, currencyExposure: 13.34, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 87, USD: 9, EUR: 2, OTHER: 2 },
      geography: { IL: 68, US: 18, EU: 8, EM: 3, OTHER: 3 },
      assetClass: { equity: 24, bonds: 58, cash: 10, alternative: 8 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7861", provider: "מיטב", name: "כספי (שקלי)", fundNumber: 7861,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0.04, mgmtFee: 0.55,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 88, cash: 12, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "meitav_7862", provider: "מיטב", name: "אשראי ואג\"ח", fundNumber: 7862,
    type: "gemel", riskLevel: "low",
    equityExposure: 3.92, foreignExposure: 17.51, currencyExposure: 8.90, mgmtFee: 0.62,
    allocation: {
      currency: { ILS: 91, USD: 6, EUR: 2, OTHER: 1 },
      geography: { IL: 82, US: 10, EU: 5, EM: 2, OTHER: 1 },
      assetClass: { equity: 4, bonds: 70, cash: 10, alternative: 16 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════════════════════════════
  // הראל — 7 מסלולים
  // ═══════════════════════════════════════

  {
    id: "harel_8522", provider: "הראל", name: "מניות", fundNumber: 8522,
    type: "gemel", riskLevel: "high",
    equityExposure: 95.43, foreignExposure: 54.40, currencyExposure: 27.37, mgmtFee: 0.55,
    allocation: {
      currency: { ILS: 73, USD: 19, EUR: 5, OTHER: 3 },
      geography: { IL: 46, US: 30, EU: 12, EM: 7, OTHER: 5 },
      assetClass: { equity: 95, bonds: 1, cash: 3, alternative: 1 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "harel_15286", provider: "הראל", name: "מניות סחיר", fundNumber: 15286,
    type: "gemel", riskLevel: "high",
    equityExposure: 97.85, foreignExposure: 12.66, currencyExposure: 10.65, mgmtFee: 0.54,
    allocation: {
      currency: { ILS: 89, USD: 7, EUR: 2, OTHER: 2 },
      geography: { IL: 87, US: 7, EU: 3, EM: 1, OTHER: 2 },
      assetClass: { equity: 98, bonds: 0, cash: 1, alternative: 1 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "harel_13414", provider: "הראל", name: "עוקב מדד S&P 500", fundNumber: 13414,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.07, foreignExposure: 105.65, currencyExposure: 98.30, mgmtFee: 0.56,
    allocation: {
      currency: { ILS: 2, USD: 98, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 99, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "harel_15040", provider: "הראל", name: "עוקב מדדי מניות", fundNumber: 15040,
    type: "gemel", riskLevel: "high",
    equityExposure: 97.90, foreignExposure: 98.81, currencyExposure: 96.68, mgmtFee: 0.56,
    allocation: {
      currency: { ILS: 3, USD: 60, EUR: 20, OTHER: 17 },
      geography: { IL: 1, US: 55, EU: 20, EM: 15, OTHER: 9 },
      assetClass: { equity: 98, bonds: 0, cash: 2, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "harel_8211", provider: "הראל", name: "כללי", fundNumber: 8211,
    type: "gemel", riskLevel: "medium",
    equityExposure: 44.62, foreignExposure: 31.72, currencyExposure: 18.03, mgmtFee: 0.55,
    allocation: {
      currency: { ILS: 82, USD: 12, EUR: 3, OTHER: 3 },
      geography: { IL: 68, US: 18, EU: 7, EM: 4, OTHER: 3 },
      assetClass: { equity: 45, bonds: 41, cash: 8, alternative: 6 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "harel_8521", provider: "הראל", name: "אשראי ואג\"ח עם מניות", fundNumber: 8521,
    type: "gemel", riskLevel: "low",
    equityExposure: 18.48, foreignExposure: 18.74, currencyExposure: 13.98, mgmtFee: 0.58,
    allocation: {
      currency: { ILS: 86, USD: 9, EUR: 3, OTHER: 2 },
      geography: { IL: 81, US: 10, EU: 5, EM: 2, OTHER: 2 },
      assetClass: { equity: 18, bonds: 70, cash: 4, alternative: 8 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "harel_13254", provider: "הראל", name: "כספי (שקלי)", fundNumber: 13254,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.57,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 96, cash: 4, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════════════════════════════
  // אלטשולר שחם — 6 מסלולים
  // ═══════════════════════════════════════

  {
    id: "altshuler_7799", provider: "אלטשולר שחם", name: "מניות", fundNumber: 7799,
    type: "gemel", riskLevel: "high",
    equityExposure: 96.71, foreignExposure: 62.05, currencyExposure: 29.35, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 71, USD: 20, EUR: 5, OTHER: 4 },
      geography: { IL: 38, US: 35, EU: 13, EM: 8, OTHER: 6 },
      assetClass: { equity: 97, bonds: 0, cash: 3, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "altshuler_14864", provider: "אלטשולר שחם", name: "עוקב מדדי מניות", fundNumber: 14864,
    type: "gemel", riskLevel: "high",
    equityExposure: 100.73, foreignExposure: 143.13, currencyExposure: 101.24, mgmtFee: 0.56,
    allocation: {
      currency: { ILS: 0, USD: 60, EUR: 20, OTHER: 20 },
      geography: { IL: 0, US: 55, EU: 20, EM: 15, OTHER: 10 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "altshuler_14865", provider: "אלטשולר שחם", name: "עוקב מדד S&P 500", fundNumber: 14865,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.77, foreignExposure: 134.72, currencyExposure: 99.28, mgmtFee: 0.54,
    allocation: {
      currency: { ILS: 1, USD: 99, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 99, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "altshuler_7798", provider: "אלטשולר שחם", name: "כללי", fundNumber: 7798,
    type: "gemel", riskLevel: "medium",
    equityExposure: 46.51, foreignExposure: 36.3, currencyExposure: 17.87, mgmtFee: 0.63,
    allocation: {
      currency: { ILS: 82, USD: 12, EUR: 3, OTHER: 3 },
      geography: { IL: 64, US: 20, EU: 8, EM: 5, OTHER: 3 },
      assetClass: { equity: 47, bonds: 46, cash: 4, alternative: 3 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "altshuler_7800", provider: "אלטשולר שחם", name: "אשראי ואג\"ח עם מניות", fundNumber: 7800,
    type: "gemel", riskLevel: "low",
    equityExposure: 21.24, foreignExposure: 27.39, currencyExposure: 14.80, mgmtFee: 0.64,
    allocation: {
      currency: { ILS: 85, USD: 10, EUR: 3, OTHER: 2 },
      geography: { IL: 73, US: 15, EU: 7, EM: 3, OTHER: 2 },
      assetClass: { equity: 21, bonds: 59, cash: 12, alternative: 8 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "altshuler_7802", provider: "אלטשולר שחם", name: "כספי (שקלי)", fundNumber: 7802,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.60,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 88, cash: 12, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════════════════════════════
  // מגדל — 7 מסלולים
  // ═══════════════════════════════════════

  {
    id: "migdal_7934", provider: "מגדל", name: "מניות", fundNumber: 7934,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.13, foreignExposure: 53.59, currencyExposure: 24.26, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 76, USD: 17, EUR: 4, OTHER: 3 },
      geography: { IL: 46, US: 30, EU: 12, EM: 7, OTHER: 5 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "migdal_15456", provider: "מגדל", name: "מניות סחיר", fundNumber: 15456,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.50, foreignExposure: 1.71, currencyExposure: 1.40, mgmtFee: 0.61,
    allocation: {
      currency: { ILS: 99, USD: 1, EUR: 0, OTHER: 0 },
      geography: { IL: 98, US: 1, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "migdal_13563", provider: "מגדל", name: "עוקב מדד S&P500", fundNumber: 13563,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.98, foreignExposure: 99.98, currencyExposure: 100.01, mgmtFee: 0.57,
    allocation: {
      currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 100, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "migdal_14943", provider: "מגדל", name: "עוקב מדדי מניות", fundNumber: 14943,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.48, foreignExposure: 99.48, currencyExposure: 99.70, mgmtFee: 0.62,
    allocation: {
      currency: { ILS: 0, USD: 60, EUR: 20, OTHER: 20 },
      geography: { IL: 1, US: 55, EU: 20, EM: 15, OTHER: 9 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "migdal_7936", provider: "מגדל", name: "כללי", fundNumber: 7936,
    type: "gemel", riskLevel: "medium",
    equityExposure: 52.15, foreignExposure: 39.58, currencyExposure: 18.97, mgmtFee: 0.62,
    allocation: {
      currency: { ILS: 81, USD: 13, EUR: 3, OTHER: 3 },
      geography: { IL: 60, US: 22, EU: 9, EM: 5, OTHER: 4 },
      assetClass: { equity: 52, bonds: 27, cash: 8, alternative: 13 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "migdal_7935", provider: "מגדל", name: "אשראי ואג\"ח עם מניות", fundNumber: 7935,
    type: "gemel", riskLevel: "low",
    equityExposure: 23.20, foreignExposure: 25.13, currencyExposure: 12.24, mgmtFee: 0.62,
    allocation: {
      currency: { ILS: 88, USD: 8, EUR: 2, OTHER: 2 },
      geography: { IL: 75, US: 14, EU: 6, EM: 3, OTHER: 2 },
      assetClass: { equity: 23, bonds: 47, cash: 8, alternative: 22 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "migdal_7931", provider: "מגדל", name: "כספי (שקלי)", fundNumber: 7931,
    type: "gemel", riskLevel: "low",
    equityExposure: 2.14, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.60,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 2, bonds: 90, cash: 8, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════ כלל ═══════════════

  {
    id: "clal_7994", provider: "כלל", name: "כללי", fundNumber: 7994,
    type: "gemel", riskLevel: "medium",
    equityExposure: 48.22, foreignExposure: 37.50, currencyExposure: 18.75, mgmtFee: 0.61,
    allocation: {
      currency: { ILS: 81, USD: 13, EUR: 3, OTHER: 3 },
      geography: { IL: 62, US: 21, EU: 8, EM: 5, OTHER: 4 },
      assetClass: { equity: 48, bonds: 28, cash: 12, alternative: 12 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "clal_7995", provider: "כלל", name: "מניות", fundNumber: 7995,
    type: "gemel", riskLevel: "high",
    equityExposure: 96.50, foreignExposure: 57.56, currencyExposure: 24.12, mgmtFee: 0.60,
    allocation: {
      currency: { ILS: 76, USD: 17, EUR: 4, OTHER: 3 },
      geography: { IL: 42, US: 33, EU: 12, EM: 7, OTHER: 6 },
      assetClass: { equity: 97, bonds: 0, cash: 2, alternative: 1 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "clal_13253", provider: "כלל", name: "עוקב מדד S&P500", fundNumber: 13253,
    type: "gemel", riskLevel: "high",
    equityExposure: 100.26, foreignExposure: 113.15, currencyExposure: 100.57, mgmtFee: 0.62,
    allocation: {
      currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 100, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "clal_15427", provider: "כלל", name: "מניות סחיר", fundNumber: 15427,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.35, foreignExposure: 2.51, currencyExposure: 6.06, mgmtFee: 0,
    allocation: {
      currency: { ILS: 94, USD: 4, EUR: 1, OTHER: 1 },
      geography: { IL: 97, US: 2, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "clal_14791", provider: "כלל", name: "עוקב מדדי מניות", fundNumber: 14791,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.84, foreignExposure: 99.84, currencyExposure: 100.38, mgmtFee: 0.63,
    allocation: {
      currency: { ILS: 0, USD: 60, EUR: 20, OTHER: 20 },
      geography: { IL: 0, US: 55, EU: 20, EM: 15, OTHER: 10 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "clal_7993", provider: "כלל", name: "כספי", fundNumber: 7993,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.61,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 88, cash: 12, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════ הפניקס ═══════════════

  {
    id: "phoenix_7908", provider: "הפניקס", name: "כללי", fundNumber: 7908,
    type: "gemel", riskLevel: "medium",
    equityExposure: 45.70, foreignExposure: 46.25, currencyExposure: 22.03, mgmtFee: 0.62,
    allocation: {
      currency: { ILS: 78, USD: 15, EUR: 4, OTHER: 3 },
      geography: { IL: 54, US: 26, EU: 10, EM: 6, OTHER: 4 },
      assetClass: { equity: 46, bonds: 38, cash: 8, alternative: 8 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "phoenix_7975", provider: "הפניקס", name: "מניות", fundNumber: 7975,
    type: "gemel", riskLevel: "high",
    equityExposure: 94.34, foreignExposure: 62.36, currencyExposure: 26.74, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 73, USD: 19, EUR: 5, OTHER: 3 },
      geography: { IL: 38, US: 35, EU: 13, EM: 8, OTHER: 6 },
      assetClass: { equity: 94, bonds: 2, cash: 3, alternative: 1 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "phoenix_13250", provider: "הפניקס", name: "עוקב מדד S&P500", fundNumber: 13250,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.63, foreignExposure: 112.93, currencyExposure: 99.51, mgmtFee: 0.58,
    allocation: {
      currency: { ILS: 1, USD: 99, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 99, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "phoenix_15233", provider: "הפניקס", name: "מניות סחיר", fundNumber: 15233,
    type: "gemel", riskLevel: "high",
    equityExposure: 95.35, foreignExposure: 14.89, currencyExposure: 16.43, mgmtFee: 0.53,
    allocation: {
      currency: { ILS: 84, USD: 10, EUR: 3, OTHER: 3 },
      geography: { IL: 85, US: 8, EU: 3, EM: 2, OTHER: 2 },
      assetClass: { equity: 95, bonds: 0, cash: 4, alternative: 1 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "phoenix_7907", provider: "הפניקס", name: "עוקב מדדי מניות", fundNumber: 7907,
    type: "gemel", riskLevel: "high",
    equityExposure: 96.85, foreignExposure: 97.46, currencyExposure: 98.37, mgmtFee: 0.60,
    allocation: {
      currency: { ILS: 2, USD: 60, EUR: 20, OTHER: 18 },
      geography: { IL: 3, US: 55, EU: 20, EM: 13, OTHER: 9 },
      assetClass: { equity: 97, bonds: 0, cash: 3, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "phoenix_13209", provider: "הפניקס", name: "כספי", fundNumber: 13209,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.68,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 90, cash: 10, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════ מנורה מבטחים ═══════════════

  {
    id: "menora_8675", provider: "מנורה מבטחים", name: "כללי", fundNumber: 8675,
    type: "gemel", riskLevel: "medium",
    equityExposure: 49.58, foreignExposure: 40.93, currencyExposure: 19.14, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 81, USD: 13, EUR: 3, OTHER: 3 },
      geography: { IL: 59, US: 23, EU: 9, EM: 5, OTHER: 4 },
      assetClass: { equity: 50, bonds: 22, cash: 10, alternative: 18 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "menora_15724", provider: "מנורה מבטחים", name: "מניות", fundNumber: 15724,
    type: "gemel", riskLevel: "high",
    equityExposure: 96.32, foreignExposure: 1.49, currencyExposure: 14.35, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 86, USD: 10, EUR: 2, OTHER: 2 },
      geography: { IL: 98, US: 1, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 96, bonds: 0, cash: 4, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "menora_13874", provider: "מנורה מבטחים", name: "עוקב מדד S&P500", fundNumber: 13874,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.29, foreignExposure: 103.62, currencyExposure: 98.09, mgmtFee: 0.52,
    allocation: {
      currency: { ILS: 2, USD: 98, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 99, EU: 0, EM: 0, OTHER: 1 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "menora_8683", provider: "מנורה מבטחים", name: "עוקב מדדי מניות", fundNumber: 8683,
    type: "gemel", riskLevel: "high",
    equityExposure: 98.86, foreignExposure: 69.73, currencyExposure: 49.49, mgmtFee: 0.57,
    allocation: {
      currency: { ILS: 51, USD: 30, EUR: 10, OTHER: 9 },
      geography: { IL: 30, US: 40, EU: 15, EM: 10, OTHER: 5 },
      assetClass: { equity: 99, bonds: 0, cash: 1, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "menora_13353", provider: "מנורה מבטחים", name: "מניות סחיר", fundNumber: 13353,
    type: "gemel", riskLevel: "high",
    equityExposure: 96.51, foreignExposure: 96.51, currencyExposure: 59.35, mgmtFee: 0.59,
    allocation: {
      currency: { ILS: 41, USD: 35, EUR: 12, OTHER: 12 },
      geography: { IL: 4, US: 55, EU: 20, EM: 12, OTHER: 9 },
      assetClass: { equity: 97, bonds: 0, cash: 3, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "menora_8693", provider: "מנורה מבטחים", name: "כספי", fundNumber: 8693,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.55,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 38, cash: 62, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },

  // ═══════════════ מור ═══════════════

  {
    id: "more_12538", provider: "מור", name: "כללי", fundNumber: 12538,
    type: "gemel", riskLevel: "medium",
    equityExposure: 49.1, foreignExposure: 42.09, currencyExposure: 18.8, mgmtFee: 0.72,
    allocation: {
      currency: { ILS: 81, USD: 13, EUR: 3, OTHER: 3 },
      geography: { IL: 58, US: 24, EU: 9, EM: 5, OTHER: 4 },
      assetClass: { equity: 49, bonds: 35, cash: 10, alternative: 6 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "more_12537", provider: "מור", name: "מניות", fundNumber: 12537,
    type: "gemel", riskLevel: "high",
    equityExposure: 99.81, foreignExposure: 63.9, currencyExposure: 23.01, mgmtFee: 0.73,
    allocation: {
      currency: { ILS: 77, USD: 16, EUR: 4, OTHER: 3 },
      geography: { IL: 36, US: 36, EU: 14, EM: 8, OTHER: 6 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "more_7958", provider: "מור", name: "עוקב מדד S&P500", fundNumber: 7958,
    type: "gemel", riskLevel: "high",
    equityExposure: 100.51, foreignExposure: 100.51, currencyExposure: 100.39, mgmtFee: 0.71,
    allocation: {
      currency: { ILS: 0, USD: 100, EUR: 0, OTHER: 0 },
      geography: { IL: 0, US: 100, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "more_15256", provider: "מור", name: "מניות סחיר", fundNumber: 15256,
    type: "gemel", riskLevel: "high",
    equityExposure: 95.63, foreignExposure: 59.38, currencyExposure: 16.07, mgmtFee: 0.67,
    allocation: {
      currency: { ILS: 84, USD: 10, EUR: 3, OTHER: 3 },
      geography: { IL: 41, US: 33, EU: 13, EM: 8, OTHER: 5 },
      assetClass: { equity: 96, bonds: 0, cash: 4, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "more_15259", provider: "מור", name: "עוקב מדדי מניות", fundNumber: 15259,
    type: "gemel", riskLevel: "high",
    equityExposure: 100.35, foreignExposure: 103.5, currencyExposure: 100.49, mgmtFee: 0.67,
    allocation: {
      currency: { ILS: 0, USD: 60, EUR: 20, OTHER: 20 },
      geography: { IL: 0, US: 55, EU: 20, EM: 15, OTHER: 10 },
      assetClass: { equity: 100, bonds: 0, cash: 0, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
  {
    id: "more_7963", provider: "מור", name: "כספי", fundNumber: 7963,
    type: "gemel", riskLevel: "low",
    equityExposure: 0, foreignExposure: 0, currencyExposure: 0, mgmtFee: 0.71,
    allocation: {
      currency: { ILS: 100, USD: 0, EUR: 0, OTHER: 0 },
      geography: { IL: 100, US: 0, EU: 0, EM: 0, OTHER: 0 },
      assetClass: { equity: 0, bonds: 88, cash: 12, alternative: 0 },
      liquidity: "conditional", liquidityNote: "נזיל — קופת גמל להשקעה",
    },
    lastUpdated: "2026-02",
  },
];

/* ── Helper Functions ── */

export function searchFunds(query: string): RegisteredFund[] {
  const q = query.toLowerCase();
  return FUND_REGISTRY.filter(f =>
    f.provider.includes(query) ||
    f.name.includes(query) ||
    f.fundNumber.toString().includes(q)
  );
}

export function getFundsByProvider(provider: string): RegisteredFund[] {
  return FUND_REGISTRY.filter(f => f.provider === provider);
}

export function getFundById(id: string): RegisteredFund | undefined {
  return FUND_REGISTRY.find(f => f.id === id);
}

export function getFundByNumber(num: number): RegisteredFund | undefined {
  return FUND_REGISTRY.find(f => f.fundNumber === num);
}

export const PROVIDERS = ["מיטב", "הראל", "אלטשולר שחם", "מגדל", "כלל", "הפניקס", "מנורה מבטחים", "מור"] as const;
