/**
 * Month-close pipeline — called when advisor clicks "סגירת חודש".
 *
 * 1. RPC close_month(monthId) on Supabase — marks the month closed
 *    and updates every goal's `fv_projected` + `track` (on/behind/at_risk)
 *    based on the new realised-contribution baseline.
 * 2. Re-runs the tasks engine to refresh recommendations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { runRules, persistTasks } from "./tasks-engine";
import {
  getCashflowSummary, getNetWorth, listGoals, listLiabilities, listAssets,
} from "./queries";

export async function closeMonthAndSync(
  sb: SupabaseClient,
  householdId: string,
  monthId: string,
): Promise<{ closed: true; goalsUpdated: number; tasksRefreshed: number }> {
  // 1. Close the month on the server (triggers goal FV re-projection)
  const { error: closeErr } = await sb.rpc("close_month", { p_month_id: monthId });
  if (closeErr) throw closeErr;

  // 2. Pull fresh snapshot
  const [cashflow, netWorth, goals, liabilities, assets] = await Promise.all([
    getCashflowSummary(sb, householdId, 12),
    getNetWorth(sb, householdId),
    listGoals(sb, householdId),
    listLiabilities(sb, householdId),
    listAssets(sb, householdId),
  ]);

  // 3. Re-run rules engine
  const drafts = runRules({ householdId, cashflow, netWorth, goals, liabilities, assets });
  await persistTasks(sb, householdId, drafts);

  return {
    closed: true,
    goalsUpdated: goals.length,
    tasksRefreshed: drafts.length,
  };
}
