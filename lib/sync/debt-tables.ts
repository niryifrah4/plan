/**
 * ═══════════════════════════════════════════════════════════
 *  Debt Tables Sync — Supabase ↔ DebtData (typed tables path)
 * ═══════════════════════════════════════════════════════════
 *
 * Phase 2 of the debt-page work (2026-05-19).
 *
 * Writes the same DebtData shape that the JSON blob holds, but into proper
 * relational tables: mortgages, mortgage_tracks, consumer_loans,
 * installment_purchases (see migration 0018_debt_typed_tables.sql).
 *
 * Strategy: full snapshot per-household upsert. On every save we send the
 * entire DebtData, upsert all rows by id, and delete any DB rows whose id is
 * not in the snapshot. Simple, idempotent, ~25 rows max per household.
 *
 * The blob path (`pushBlob('debt_data')`) keeps running in parallel during
 * Phase 2 so the read side stays on localStorage. A later phase flips the
 * read path to `pullDebtFromTables`.
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { getHouseholdId } from "./remote-sync";
import type {
  DebtData,
  Installment,
  Loan,
  MortgageData,
  MortgageTrack,
  IndexationType,
  RepaymentMethod,
} from "@/lib/debt-store";

/* ── Row shapes (DB) ─────────────────────────────────────────────────────── */

interface MortgageRow {
  id: string;
  household_id: string;
  property_id: string | null;
  bank: string;
  property_value: number;
}

interface MortgageTrackRow {
  id: string;
  mortgage_id: string;
  name: string;
  interest_rate: number;
  margin: number | null;
  indexation: string;
  repayment_method: string;
  original_amount: number;
  remaining_balance: number;
  monthly_payment: number;
  start_date: string;
  end_date: string;
  total_payments: number;
  /** Phase 7 — variable-rate reset metadata. Both nullable. */
  next_reset_date: string | null;
  reset_period_years: number | null;
}

interface LoanRow {
  id: string;
  household_id: string;
  lender: string;
  start_date: string;
  total_payments: number;
  monthly_payment: number;
  interest_rate: number | null;
}

interface InstallmentRow {
  id: string;
  household_id: string;
  merchant: string;
  source: string;
  current_payment: number;
  total_payments: number;
  monthly_amount: number;
}

/* ── Mappers ─────────────────────────────────────────────────────────────── */

function mortgageToRow(m: MortgageData, householdId: string): MortgageRow {
  return {
    id: m.id,
    household_id: householdId,
    property_id: m.propertyId || null,
    bank: m.bank || "",
    property_value: m.propertyValue || 0,
  };
}

function trackToRow(t: MortgageTrack, mortgageId: string): MortgageTrackRow {
  return {
    id: t.id,
    mortgage_id: mortgageId,
    name: t.name || "",
    interest_rate: t.interestRate || 0,
    margin: typeof t.margin === "number" ? t.margin : null,
    indexation: t.indexation || "לא צמוד",
    repayment_method: t.repaymentMethod || "שפיצר",
    original_amount: t.originalAmount || 0,
    remaining_balance: t.remainingBalance || 0,
    monthly_payment: t.monthlyPayment || 0,
    start_date: t.startDate || "",
    end_date: t.endDate || "",
    total_payments: t.totalPayments || 0,
    next_reset_date: t.nextResetDate || null,
    reset_period_years: typeof t.resetPeriodYears === "number" ? t.resetPeriodYears : null,
  };
}

function loanToRow(l: Loan, householdId: string): LoanRow {
  return {
    id: l.id,
    household_id: householdId,
    lender: l.lender || "",
    start_date: l.startDate || "",
    total_payments: l.totalPayments || 0,
    monthly_payment: l.monthlyPayment || 0,
    interest_rate: typeof l.interestRate === "number" ? l.interestRate : null,
  };
}

function installmentToRow(i: Installment, householdId: string): InstallmentRow {
  return {
    id: i.id,
    household_id: householdId,
    merchant: i.merchant || "",
    source: i.source || "",
    current_payment: i.currentPayment || 1,
    total_payments: i.totalPayments || 1,
    monthly_amount: i.monthlyAmount || 0,
  };
}

function rowToMortgage(row: MortgageRow, tracks: MortgageTrack[]): MortgageData {
  return {
    id: row.id,
    propertyId: row.property_id || undefined,
    bank: row.bank || "",
    propertyValue: Number(row.property_value) || 0,
    tracks,
  };
}

function rowToTrack(row: MortgageTrackRow): MortgageTrack {
  return {
    id: row.id,
    name: row.name || "",
    interestRate: Number(row.interest_rate) || 0,
    margin: row.margin == null ? undefined : Number(row.margin),
    indexation: (row.indexation as IndexationType) || "לא צמוד",
    repaymentMethod: (row.repayment_method as RepaymentMethod) || "שפיצר",
    originalAmount: Number(row.original_amount) || 0,
    remainingBalance: Number(row.remaining_balance) || 0,
    monthlyPayment: Number(row.monthly_payment) || 0,
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    totalPayments: row.total_payments || 0,
    nextResetDate: row.next_reset_date || undefined,
    resetPeriodYears:
      row.reset_period_years == null ? undefined : Number(row.reset_period_years),
  };
}

function rowToLoan(row: LoanRow): Loan {
  const loan: Loan = {
    id: row.id,
    lender: row.lender || "",
    startDate: row.start_date || "",
    totalPayments: row.total_payments || 0,
    monthlyPayment: Number(row.monthly_payment) || 0,
  };
  if (row.interest_rate != null) loan.interestRate = Number(row.interest_rate);
  return loan;
}

function rowToInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    merchant: row.merchant || "",
    source: row.source || "",
    currentPayment: row.current_payment || 1,
    totalPayments: row.total_payments || 1,
    monthlyAmount: Number(row.monthly_amount) || 0,
  };
}

/* ── Push (write whole snapshot) ─────────────────────────────────────────── */

/**
 * Replace this household's debt rows with the given snapshot. Upserts by id
 * and deletes anything not in the snapshot. Returns false on any error so
 * the caller can fall back to the blob path. Never throws.
 *
 * Idempotent — safe to call repeatedly with the same data.
 */
export async function pushDebtToTables(
  data: DebtData,
  householdIdOverride?: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  // CRITICAL — push-race protection. The optional override is supplied by
  // the fire-and-forget wrapper which captures the household synchronously.
  // Without it, an async push can write client A's data to client B's row
  // when the advisor switches mid-flight. See blob-sync.ts pushBlob.
  const hh = householdIdOverride ?? getHouseholdId();
  if (!hh) return false;
  const sb = getSupabaseBrowser();
  if (!sb) return false;

  try {
    // UUID validation guard — IDs come from localStorage (attacker-controlled
    // surface). PostgREST + RLS already block cross-tenant access, but we
    // refuse to interpolate malformed values into `.not("id","in",...)` to
    // keep the SQL surface tight.
    const isUuid = (v: unknown): v is string =>
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const filterIds = (ids: string[]): string[] => {
      const safe = ids.filter(isUuid);
      if (safe.length !== ids.length) {
        console.warn(`[debt-tables] dropped ${ids.length - safe.length} non-UUID id(s)`);
      }
      return safe;
    };

    // Mortgages — upsert then delete stale rows.
    const mortgageRows = (data.mortgages || []).map((m) => mortgageToRow(m, hh));
    const mortgageIds = filterIds(mortgageRows.map((r) => r.id));
    if (mortgageRows.length > 0) {
      const { error: mErr } = await sb
        .from("mortgages")
        .upsert(mortgageRows, { onConflict: "id" });
      if (mErr) {
        console.warn("[debt-tables] mortgages upsert failed:", mErr.message);
        return false;
      }
    }
    // Phase 2 safety (per security-agent 2026-05-19): only delete when the
    // snapshot has at least one mortgage. A fully-empty snapshot is treated
    // as "leave the existing rows alone" — the legitimate "user deleted all
    // mortgages" case syncs eventually when the next non-empty save runs,
    // and stale rows are scrubbed on Phase 3 read-flip. This prevents a
    // localStorage wipe (private-tab close, manual clear) from cascading
    // into Supabase row deletion. Cascade removes their tracks.
    if (mortgageIds.length > 0) {
      const { error: dmErr } = await sb
        .from("mortgages")
        .delete()
        .eq("household_id", hh)
        .not("id", "in", `(${mortgageIds.map((id) => `"${id}"`).join(",")})`);
      if (dmErr) console.warn("[debt-tables] mortgages delete-stale failed:", dmErr.message);
    }

    // Tracks — upsert each mortgage's tracks, then delete stale tracks for that mortgage.
    for (const m of data.mortgages || []) {
      const trackRows = (m.tracks || []).map((t) => trackToRow(t, m.id));
      const trackIds = filterIds(trackRows.map((r) => r.id));
      if (trackRows.length > 0) {
        const { error: tErr } = await sb
          .from("mortgage_tracks")
          .upsert(trackRows, { onConflict: "id" });
        if (tErr) {
          console.warn("[debt-tables] tracks upsert failed:", tErr.message);
          return false;
        }
      }
      // Same guard — only delete when we have a non-empty set of "keep" IDs.
      if (trackIds.length > 0) {
        const { error: dtErr } = await sb
          .from("mortgage_tracks")
          .delete()
          .eq("mortgage_id", m.id)
          .not("id", "in", `(${trackIds.map((id) => `"${id}"`).join(",")})`);
        if (dtErr) console.warn("[debt-tables] tracks delete-stale failed:", dtErr.message);
      }
    }

    // Loans
    const loanRows = (data.loans || []).map((l) => loanToRow(l, hh));
    const loanIds = filterIds(loanRows.map((r) => r.id));
    if (loanRows.length > 0) {
      const { error: lErr } = await sb
        .from("consumer_loans")
        .upsert(loanRows, { onConflict: "id" });
      if (lErr) {
        console.warn("[debt-tables] loans upsert failed:", lErr.message);
        return false;
      }
    }
    if (loanIds.length > 0) {
      const { error: dlErr } = await sb
        .from("consumer_loans")
        .delete()
        .eq("household_id", hh)
        .not("id", "in", `(${loanIds.map((id) => `"${id}"`).join(",")})`);
      if (dlErr) console.warn("[debt-tables] loans delete-stale failed:", dlErr.message);
    }

    // Installments
    const instRows = (data.installments || []).map((i) => installmentToRow(i, hh));
    const instIds = filterIds(instRows.map((r) => r.id));
    if (instRows.length > 0) {
      const { error: iErr } = await sb
        .from("installment_purchases")
        .upsert(instRows, { onConflict: "id" });
      if (iErr) {
        console.warn("[debt-tables] installments upsert failed:", iErr.message);
        return false;
      }
    }
    if (instIds.length > 0) {
      const { error: diErr } = await sb
        .from("installment_purchases")
        .delete()
        .eq("household_id", hh)
        .not("id", "in", `(${instIds.map((id) => `"${id}"`).join(",")})`);
      if (diErr) console.warn("[debt-tables] installments delete-stale failed:", diErr.message);
    }

    return true;
  } catch (e) {
    console.warn("[debt-tables] push threw:", e);
    return false;
  }
}

export function pushDebtToTablesInBackground(data: DebtData) {
  // Snapshot the household synchronously to neutralize the push-race.
  const hh = getHouseholdId();
  void pushDebtToTables(data, hh);
}

/* ── Pull (read whole snapshot) ─────────────────────────────────────────── */

/**
 * Read the full DebtData for the current household from typed tables.
 * Returns null on missing config / no household / error. Not yet wired into
 * the read path — `loadDebtData` still reads from localStorage. Will be used
 * in a later phase to make Supabase the source of truth.
 */
export async function pullDebtFromTables(): Promise<DebtData | null> {
  if (!isSupabaseConfigured()) return null;
  const hh = getHouseholdId();
  if (!hh) return null;
  const sb = getSupabaseBrowser();
  if (!sb) return null;

  try {
    const [mortgagesRes, tracksRes, loansRes, instRes] = await Promise.all([
      sb.from("mortgages").select("*").eq("household_id", hh),
      sb
        .from("mortgage_tracks")
        .select("*, mortgages!inner(household_id)")
        .eq("mortgages.household_id", hh),
      sb.from("consumer_loans").select("*").eq("household_id", hh),
      sb.from("installment_purchases").select("*").eq("household_id", hh),
    ]);

    if (mortgagesRes.error || tracksRes.error || loansRes.error || instRes.error) {
      console.warn("[debt-tables] pull error:", {
        m: mortgagesRes.error?.message,
        t: tracksRes.error?.message,
        l: loansRes.error?.message,
        i: instRes.error?.message,
      });
      return null;
    }

    const tracksByMortgage = new Map<string, MortgageTrack[]>();
    for (const row of (tracksRes.data || []) as MortgageTrackRow[]) {
      const list = tracksByMortgage.get(row.mortgage_id) || [];
      list.push(rowToTrack(row));
      tracksByMortgage.set(row.mortgage_id, list);
    }

    const mortgages: MortgageData[] = ((mortgagesRes.data || []) as MortgageRow[]).map((row) =>
      rowToMortgage(row, tracksByMortgage.get(row.id) || [])
    );
    const loans: Loan[] = ((loansRes.data || []) as LoanRow[]).map(rowToLoan);
    const installments: Installment[] = ((instRes.data || []) as InstallmentRow[]).map(
      rowToInstallment
    );

    return { mortgages, loans, installments };
  } catch (e) {
    console.warn("[debt-tables] pull threw:", e);
    return null;
  }
}

/* ── One-time backfill helper ───────────────────────────────────────────── */

/**
 * If the typed tables are empty for the current household but `localData` has
 * content, push it once. Used at boot to migrate Phase-1 blob data without
 * touching the read path. Idempotent — re-runs harmlessly when tables are
 * already populated (the freshness check skips).
 */
export async function backfillDebtFromBlobIfNeeded(localData: DebtData): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const hh = getHouseholdId();
  if (!hh) return false;
  const sb = getSupabaseBrowser();
  if (!sb) return false;

  // Skip backfill when there's nothing meaningful to push.
  const hasContent =
    (localData.mortgages && localData.mortgages.length > 0) ||
    (localData.loans && localData.loans.length > 0) ||
    (localData.installments && localData.installments.length > 0);
  if (!hasContent) return false;

  try {
    // Cheap freshness check — only one query, counts rows across the 3 owner tables.
    const [{ count: mCount }, { count: lCount }, { count: iCount }] = await Promise.all([
      sb.from("mortgages").select("*", { count: "exact", head: true }).eq("household_id", hh),
      sb.from("consumer_loans").select("*", { count: "exact", head: true }).eq("household_id", hh),
      sb
        .from("installment_purchases")
        .select("*", { count: "exact", head: true })
        .eq("household_id", hh),
    ]);
    const tablesEmpty = (mCount || 0) === 0 && (lCount || 0) === 0 && (iCount || 0) === 0;
    if (!tablesEmpty) return false;
    return await pushDebtToTables(localData);
  } catch (e) {
    console.warn("[debt-tables] backfill threw:", e);
    return false;
  }
}
