/**
 * Instruments Store — Supabase + localStorage fallback
 *
 * Tries Supabase first (if configured), falls back to localStorage.
 * Used by the cashflow page widget and the documents upload page.
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import {
  loadInstruments as loadFromLocalStorage,
  mergeAndSaveInstruments as mergeLocalStorage,
  type FinancialInstrument,
} from "@/lib/doc-parser/instruments";

/**
 * Load all instruments for the current household.
 * Falls back to localStorage if Supabase is not configured.
 */
export async function loadAllInstruments(householdId?: string): Promise<FinancialInstrument[]> {
  if (isSupabaseConfigured() && householdId) {
    try {
      const sb = getSupabaseBrowser();
      if (sb) {
        const { data, error } = await sb
          .from("client_instruments")
          .select("type, institution, identifier, label")
          .eq("household_id", householdId);

        if (!error && data && data.length > 0) {
          return data.map((row) => ({
            type: row.type as FinancialInstrument["type"],
            institution: row.institution,
            identifier: row.identifier,
            label: row.label,
          }));
        }
      }
    } catch {
      // Fall through to localStorage
    }
  }

  return loadFromLocalStorage();
}

/**
 * Save newly detected instruments.
 * Tries Supabase upsert first, always saves to localStorage as backup.
 */
export async function saveInstruments(
  instruments: FinancialInstrument[],
  householdId?: string,
  sourceFile?: string
): Promise<FinancialInstrument[]> {
  // Always save to localStorage
  const merged = mergeLocalStorage(instruments);

  // Try Supabase if configured
  if (isSupabaseConfigured() && householdId && instruments.length > 0) {
    try {
      const sb = getSupabaseBrowser();
      if (sb) {
        const rows = instruments.map((inst) => ({
          household_id: householdId,
          type: inst.type,
          institution: inst.institution,
          identifier: inst.identifier,
          label: inst.label,
          source_file: sourceFile || null,
        }));

        await sb.from("client_instruments").upsert(rows, {
          onConflict: "household_id,type,institution,identifier",
          ignoreDuplicates: true,
        });
      }
    } catch {
      // localStorage already saved as fallback
    }
  }

  return merged;
}
