/**
 * ═══════════════════════════════════════════════════════════
 *  SINGLE SOURCE OF TRUTH — Pension Funds Data Store
 * ═══════════════════════════════════════════════════════════
 *
 * All pension fund data lives in ONE localStorage key:
 *   verdant:pension_funds
 *
 * The /pension page reads & writes via helpers below.
 * Other pages can read via loadPensionFunds().
 */

export interface PensionFund {
  id: string;
  company: string;
  type: "pension" | "gemel" | "hishtalmut" | "bituach";

  /** תת-סוג — מפרט את סוג המוצר הספציפי */
  subtype?: // פנסיה
    | "pension_vatika" // קרן פנסיה ותיקה (לפני 1995, סגורה)
    | "pension_hadasha" // קרן פנסיה חדשה (DC)
    // ביטוח מנהלים
    | "bituach_classic" // פוליסה קלאסית (לפני 1992, מקדם + ריבית מובטחים)
    | "bituach_adif" // פוליסת עדיף (1992-2004, מקדם מובטח בלבד)
    | "bituach_2004" // פוליסה חדשה (2004+, ללא הבטחות)
    // קופות גמל
    | "gemel_regular" // קופת גמל רגילה
    | "gemel_190" // קופת גמל תיקון 190
    | "gemel_lehashkaa"; // גמל להשקעה

  /** מקדם קצבה — רלוונטי לקרנות ותיקות וביטוח מנהלים עם מקדם מובטח */
  conversionFactor?: number;

  /** ריבית מובטחת — רלוונטי לפוליסות קלאסיות בלבד */
  guaranteedRate?: number;

  balance: number;
  mgmtFeeDeposit: number;
  mgmtFeeBalance: number;
  track: string;
  monthlyContrib: number;
  insuranceCover?: { death: boolean; disability: boolean; lossOfWork: boolean };
  /** Link to fund-registry.ts for auto-allocation (single-track funds only). */
  registeredFundId?: string;

  /**
   * Track-level breakdown — populated from Mislaka XML when a single product
   * holds money across multiple investment tracks (e.g. 60% מנייתי + 40% אג״ח).
   * Per Nir 2026-04-28: "צלילה לעומק של המסלולים" — without this the risk/geo
   * pies on /pension report only the dominant track and miss the real mix.
   *
   * Sum of `tracks[].balance` should equal `balance`. If the array is empty
   * or missing, treat the fund as single-track (use top-level `registeredFundId`).
   */
  tracks?: Array<{
    name: string;
    balance: number;
    /** Matched fund-registry id — drives risk + geo pies. Optional: a manual
     * track without a registry match still counts toward "by type" only. */
    registeredFundId?: string;
    /** Annual return % from the Mislaka report (informational). */
    returnPct?: number;
  }>;

  /** תאריך פתיחה — YYYY-MM-DD (רלוונטי במיוחד לקרן השתלמות) */
  openingDate?: string;
  /**
   * מועד נזילות — YYYY-MM-DD. עדיפות עליונה: הזנה/דריסה ידנית של המשתמש.
   * אם ריק — נופלים למועד הנזילות מהדוח (annualReportDetails.liquidityDate),
   * ואם גם הוא ריק — מחשבים מ-openingDate + ותק.
   */
  liquidityDate?: string;
  /** האם העובד שכיר (6 שנים) או עצמאי (3 שנים) — לחישוב נזילות השתלמות */
  isEmployed?: boolean;

  /**
   * 2026-04-28: ownership tag — drives the per-spouse summary on /pension
   * ("כמה יש לו / כמה יש לה"). Two-character codes keep the UI compact.
   * "joint" for funds that belong to both (rare but possible).
   * Default treated as "spouse_a" when undefined for back-compat.
   */
  owner?: "spouse_a" | "spouse_b" | "joint";

  annualReportDetails?: {
    accountNumber?: string;
    customerName?: string;
    customerId?: string;
    employerName?: string;
    joinDate?: string;
    reportDate?: string;
    /** מועד נזילות מתוך הדוח ("יתרת הכספים המיועדים למשיכה חד פעמית החל מ-") — YYYY-MM-DD */
    liquidityDate?: string;
    status?: "active" | "inactive" | "unknown";
    projectedPensionAmount?: number;
    retirementAge?: number;
    salaryBase?: number;
    annualDeposits?: number;
    annualContributionsBreakdown?: {
      employee?: number;
      employer?: number;
      severance?: number;
      total?: number;
    };
    projectedCoverages?: {
      disabilityPct?: number;
      disabilityMonthly?: number;
      disabilityContributionWaiver?: number;
      spousePct?: number;
      spouseMonthly?: number;
      childPct?: number;
      childMonthly?: number;
      parentPct?: number;
      parentMonthly?: number;
      insuranceCostPctOfDeposits?: number;
    };
    balanceMovements?: {
      openingBalance?: number;
      deposits?: number;
      transfersIn?: number;
      transfersOut?: number;
      investmentProfitLoss?: number;
      managementFeesPaid?: number;
      disabilityInsuranceCost?: number;
      survivorsInsuranceCost?: number;
      actuarialAdjustment?: number;
      closingBalance?: number;
    };
    investmentTracks?: Array<{
      name: string;
      balance?: number;
      annualReturnPct?: number;
      return5yPct?: number;
      investmentExpensePct?: number;
      mgmtFeeDepositPct?: number;
      mgmtFeeBalancePct?: number;
    }>;
  };
}

import { scopedKey } from "./client-scope";
import { safeSetItem } from "@/lib/safe-storage";
import { getHouseholdId, pushToRemote, pullFromRemote, type SyncConfig } from "./sync/remote-sync";
import { reportError } from "@/lib/report-error";

const STORAGE_KEY = "verdant:pension_funds";
const PENDING_REMOTE_KEY = "verdant:pension_funds:pending_remote_sync";
export const EVENT_NAME = "verdant:pension:updated";

/* ── Supabase sync mapping ── */
const SYNC_CFG: SyncConfig<PensionFund, any> = {
  table: "pension_products",
  toRow: (f, hh) => ({
    household_id: hh,
    company: f.company,
    product_type: mapTypeToDb(f.type),
    accumulated_balance: f.balance ?? 0,
    mgmt_fee_deposits_pct: f.mgmtFeeDeposit ?? 0,
    mgmt_fee_accumulated_pct: f.mgmtFeeBalance ?? 0,
    investment_track: f.track ?? null,
    employee_contribution: f.monthlyContrib ?? 0,
    start_date: f.openingDate || null,
    member_name: f.annualReportDetails?.customerName || null,
    policy_number: f.annualReportDetails?.accountNumber || null,
    status:
      f.annualReportDetails?.status === "inactive"
        ? "frozen"
        : f.annualReportDetails?.status === "active"
          ? "active"
          : "active",
    annual_return_pct: f.annualReportDetails?.investmentTracks?.[0]?.annualReturnPct ?? null,
    as_of_date: f.annualReportDetails?.reportDate || null,
    disability_coverage_pct: f.annualReportDetails?.projectedCoverages?.disabilityPct ?? null,
    surance_raw_json: {
      id: f.id,
      subtype: f.subtype,
      conversionFactor: f.conversionFactor,
      guaranteedRate: f.guaranteedRate,
      insuranceCover: f.insuranceCover,
      registeredFundId: f.registeredFundId,
      isEmployed: f.isEmployed,
      liquidityDate: f.liquidityDate,
      annualReportDetails: f.annualReportDetails,
    },
    source: f.annualReportDetails ? "document" : "manual",
  }),
  fromRow: (r: any): PensionFund => {
    const raw = r.surance_raw_json || {};
    return {
      id: raw.id || r.id,
      company: r.company,
      type: mapTypeFromDb(r.product_type),
      subtype: raw.subtype,
      conversionFactor: raw.conversionFactor,
      guaranteedRate: raw.guaranteedRate,
      balance: Number(r.accumulated_balance || 0),
      mgmtFeeDeposit: Number(r.mgmt_fee_deposits_pct || 0),
      mgmtFeeBalance: Number(r.mgmt_fee_accumulated_pct || 0),
      track: r.investment_track || "",
      monthlyContrib: Number(r.employee_contribution || 0),
      insuranceCover: raw.insuranceCover,
      registeredFundId: raw.registeredFundId,
      openingDate: r.start_date || undefined,
      isEmployed: raw.isEmployed,
      liquidityDate: raw.liquidityDate,
      annualReportDetails: raw.annualReportDetails,
    };
  },
};

// Maps to the DB enum `pension_product_type`
// ('pension_new','pension_old','bituach_managers','gemel','gemel_invest',
//  'gemel_190','hishtalmut','kranot_pensia').
function mapTypeToDb(t: PensionFund["type"]): string {
  switch (t) {
    case "pension":
      return "pension_new";
    case "gemel":
      return "gemel";
    case "hishtalmut":
      return "hishtalmut";
    case "bituach":
      return "bituach_managers";
    default:
      return "pension_new";
  }
}
function mapTypeFromDb(t: string): PensionFund["type"] {
  if (t === "gemel" || t === "gemel_invest" || t === "gemel_190") return "gemel";
  if (t === "hishtalmut") return "hishtalmut";
  if (t === "bituach_managers") return "bituach";
  return "pension";
}

/** Pull from Supabase and overwrite local cache. Call on app boot / household switch. */
export async function hydratePensionFundsFromRemote(): Promise<boolean> {
  const remote = await pullFromRemote(SYNC_CFG);
  if (!remote) return false;
  try {
    const local = loadPensionFunds();
    const pending = localStorage.getItem(scopedKey(PENDING_REMOTE_KEY)) === "1";
    if (pending && local.length > 0 && remote.length === 0) {
      const pushed = await pushPensionFundsToRemote(local);
      if (!pushed.ok) {
        window.dispatchEvent(new Event(EVENT_NAME));
        return true;
      }
    }
    safeSetItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    window.dispatchEvent(new Event(EVENT_NAME));
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_FUNDS: PensionFund[] = [
  {
    id: "pf1",
    company: "מנורה מבטחים",
    type: "pension",
    balance: 240000,
    mgmtFeeDeposit: 1.5,
    mgmtFeeBalance: 0.22,
    track: "מסלול כללי",
    monthlyContrib: 2100,
    insuranceCover: { death: true, disability: true, lossOfWork: true },
  },
  {
    id: "pf2",
    company: "מגדל",
    type: "pension",
    balance: 95000,
    mgmtFeeDeposit: 2.0,
    mgmtFeeBalance: 0.35,
    track: "מניות",
    monthlyContrib: 800,
    insuranceCover: { death: true, disability: true, lossOfWork: false },
  },
  {
    id: "pf3",
    company: "הראל",
    type: "hishtalmut",
    balance: 45000,
    mgmtFeeDeposit: 0.0,
    mgmtFeeBalance: 0.8,
    track: "כללי",
    monthlyContrib: 850,
  },
  {
    id: "pf4",
    company: "אלטשולר שחם",
    type: "gemel",
    balance: 28000,
    mgmtFeeDeposit: 0.0,
    mgmtFeeBalance: 0.52,
    track: "מניות חו״ל",
    monthlyContrib: 500,
  },
];

export function loadPensionFunds(): PensionFund[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return []; // No data yet — return empty, NOT demo
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) { reportError("pension-store", e); }
  return [];
}

export function savePensionFunds(funds: PensionFund[]) {
  safeSetItem(scopedKey(STORAGE_KEY), JSON.stringify(funds));
  window.dispatchEvent(new Event(EVENT_NAME));
  const hh = getHouseholdId();
  if (hh) localStorage.setItem(scopedKey(PENDING_REMOTE_KEY), "1");
  void pushPensionFundsToRemote(funds, hh);
}

export async function savePensionFundsAsync(
  funds: PensionFund[]
): Promise<{ ok: boolean; error?: string }> {
  safeSetItem(scopedKey(STORAGE_KEY), JSON.stringify(funds));
  window.dispatchEvent(new Event(EVENT_NAME));
  const hh = getHouseholdId();
  if (hh) localStorage.setItem(scopedKey(PENDING_REMOTE_KEY), "1");
  return pushPensionFundsToRemote(funds, hh);
}

async function pushPensionFundsToRemote(
  funds: PensionFund[],
  householdIdOverride?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const result = await pushToRemote(SYNC_CFG, funds, householdIdOverride);
  try {
    if (result.ok) localStorage.removeItem(scopedKey(PENDING_REMOTE_KEY));
    else localStorage.setItem(scopedKey(PENDING_REMOTE_KEY), "1");
  } catch (e) { reportError("pension-store", e); }
  return result;
}

export function addPensionFund(fund: PensionFund) {
  const funds = loadPensionFunds();
  funds.push(fund);
  savePensionFunds(funds);
}

export function updatePensionFund(id: string, patch: Partial<PensionFund>) {
  const funds = loadPensionFunds();
  const idx = funds.findIndex((f) => f.id === id);
  if (idx >= 0) funds[idx] = { ...funds[idx], ...patch };
  savePensionFunds(funds);
}

export function deletePensionFund(id: string) {
  savePensionFunds(loadPensionFunds().filter((f) => f.id !== id));
}
