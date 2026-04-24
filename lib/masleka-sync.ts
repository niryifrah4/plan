/**
 * ═══════════════════════════════════════════════════════════
 *  Masleka Sync — Placeholder for Nobel Digital Integration
 * ═══════════════════════════════════════════════════════════
 *
 * כשהחיבור לנובל דיגיטל יהיה פעיל, הקובץ הזה יממש:
 * 1. אותנטיקציה מול המסלקה הפנסיונית
 * 2. משיכת כל הקרנות עם יתרות עדכניות
 * 3. התאמה אוטומטית למאגר FUND_REGISTRY לפי מספר קרן
 * 4. מילוי אוטומטי של allocation מהרג׳יסטרי
 * 5. רענון רבעוני אוטומטי
 */

import type { RegisteredFund } from "./fund-registry";
import { getFundByNumber } from "./fund-registry";

/* ── Types ── */

export interface MaslekaFundData {
  fundNumber: number;
  provider: string;
  balance: number;
  monthlyContribution: number;
  mgmtFeeDeposit: number;
  mgmtFeeBalance: number;
  investmentTrack: string;
  lastUpdated: string;
}

export interface MaslekaSyncResult {
  funds: MaslekaFundData[];
  matched: { fund: MaslekaFundData; registered: RegisteredFund }[];
  unmatched: MaslekaFundData[];
  syncDate: string;
}

/* ── Sync Function (placeholder) ── */

/**
 * Sync pension data from Masleka (Nobel Digital API).
 * Currently a placeholder — returns empty result.
 *
 * Flow when implemented:
 * 1. User authenticates via Masleka (Nobel Digital)
 * 2. API returns list of all funds with balances
 * 3. We match fundNumber to FUND_REGISTRY
 * 4. Auto-populate: balance, contributions, fees, allocation
 * 5. User confirms — saved to localStorage / Supabase
 * 6. Quarterly auto-refresh
 */
export async function syncFromMasleka(_maslekaToken: string): Promise<MaslekaSyncResult> {
  // TODO: Implement when Nobel Digital API is available
  // POST to Nobel Digital API
  // Returns all pension/gemel/hishtalmut funds for the user
  // For each fund — look up in FUND_REGISTRY by fundNumber
  // Auto-fill allocation from registry
  // If fund not in registry — flag for manual input

  return {
    funds: [],
    matched: [],
    unmatched: [],
    syncDate: new Date().toISOString(),
  };
}

/**
 * Match a Masleka fund to FUND_REGISTRY by fund number.
 */
export function matchFundToRegistry(fundNumber: number): RegisteredFund | undefined {
  return getFundByNumber(fundNumber);
}
