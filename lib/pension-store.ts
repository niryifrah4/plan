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
  subtype?:
    // פנסיה
    | "pension_vatika"     // קרן פנסיה ותיקה (לפני 1995, סגורה)
    | "pension_hadasha"    // קרן פנסיה חדשה (DC)
    // ביטוח מנהלים
    | "bituach_classic"    // פוליסה קלאסית (לפני 1992, מקדם + ריבית מובטחים)
    | "bituach_adif"       // פוליסת עדיף (1992-2004, מקדם מובטח בלבד)
    | "bituach_2004"       // פוליסה חדשה (2004+, ללא הבטחות)
    // קופות גמל
    | "gemel_regular"      // קופת גמל רגילה
    | "gemel_190"          // קופת גמל תיקון 190
    | "gemel_lehashkaa";   // גמל להשקעה

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
  /** האם העובד שכיר (6 שנים) או עצמאי (3 שנים) — לחישוב נזילות השתלמות */
  isEmployed?: boolean;
}

import { scopedKey } from "./client-scope";
import { pushToRemoteInBackground, pullFromRemote, type SyncConfig } from "./sync/remote-sync";

const STORAGE_KEY = "verdant:pension_funds";
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
    surance_raw_json: {
      id: f.id,
      subtype: f.subtype,
      conversionFactor: f.conversionFactor,
      guaranteedRate: f.guaranteedRate,
      insuranceCover: f.insuranceCover,
      registeredFundId: f.registeredFundId,
      isEmployed: f.isEmployed,
    },
    source: "manual",
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
    };
  },
};

function mapTypeToDb(t: PensionFund["type"]): string {
  switch (t) {
    case "pension": return "pension";
    case "gemel": return "gemel";
    case "hishtalmut": return "keren_hishtalmut";
    case "bituach": return "bituach_menahalim";
    default: return "pension";
  }
}
function mapTypeFromDb(t: string): PensionFund["type"] {
  if (t === "gemel") return "gemel";
  if (t === "keren_hishtalmut") return "hishtalmut";
  if (t === "bituach_menahalim") return "bituach";
  return "pension";
}

/** Pull from Supabase and overwrite local cache. Call on app boot / household switch. */
export async function hydratePensionFundsFromRemote(): Promise<boolean> {
  const remote = await pullFromRemote(SYNC_CFG);
  if (!remote) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    window.dispatchEvent(new Event(EVENT_NAME));
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_FUNDS: PensionFund[] = [
  { id: "pf1", company: "מנורה מבטחים", type: "pension", balance: 240000, mgmtFeeDeposit: 1.5, mgmtFeeBalance: 0.22, track: "מסלול כללי", monthlyContrib: 2100, insuranceCover: { death: true, disability: true, lossOfWork: true } },
  { id: "pf2", company: "מגדל", type: "pension", balance: 95000, mgmtFeeDeposit: 2.0, mgmtFeeBalance: 0.35, track: "מניות", monthlyContrib: 800, insuranceCover: { death: true, disability: true, lossOfWork: false } },
  { id: "pf3", company: "הראל", type: "hishtalmut", balance: 45000, mgmtFeeDeposit: 0.0, mgmtFeeBalance: 0.8, track: "כללי", monthlyContrib: 850 },
  { id: "pf4", company: "אלטשולר שחם", type: "gemel", balance: 28000, mgmtFeeDeposit: 0.0, mgmtFeeBalance: 0.52, track: "מניות חו״ל", monthlyContrib: 500 },
];

export function loadPensionFunds(): PensionFund[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];          // No data yet — return empty, NOT demo
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function savePensionFunds(funds: PensionFund[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(funds));
  window.dispatchEvent(new Event(EVENT_NAME));
  // Fire-and-forget push to Supabase (no-op in demo mode)
  pushToRemoteInBackground(SYNC_CFG, funds);
}

export function addPensionFund(fund: PensionFund) {
  const funds = loadPensionFunds();
  funds.push(fund);
  savePensionFunds(funds);
}

export function updatePensionFund(id: string, patch: Partial<PensionFund>) {
  const funds = loadPensionFunds();
  const idx = funds.findIndex(f => f.id === id);
  if (idx >= 0) funds[idx] = { ...funds[idx], ...patch };
  savePensionFunds(funds);
}

export function deletePensionFund(id: string) {
  savePensionFunds(loadPensionFunds().filter(f => f.id !== id));
}
