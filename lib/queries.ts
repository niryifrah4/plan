/**
 * Verdant Ledger · Data Access Layer
 * Centralised queries — keeps components thin and decouples Supabase specifics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Household, Profile, CashflowMonth, CashflowTx, BudgetPlan,
  Asset, Liability, Goal, Task, Scenario,
  CashflowSummary, NetWorth, BudgetVsActual,
  Security, SecurityValued, MaslekaFile, MaslekaEntry,
} from "@/types/db";

// ===== Households =====
export async function listHouseholds(sb: SupabaseClient): Promise<Household[]> {
  const { data, error } = await sb
    .from("households")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getHousehold(
  sb: SupabaseClient, householdId: string,
): Promise<Household | null> {
  const { data } = await sb
    .from("households")
    .select("*")
    .eq("id", householdId)
    .single();
  return data;
}

// ===== Profile (BDO answers) =====
export async function getProfile(
  sb: SupabaseClient, householdId: string,
): Promise<Profile | null> {
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();
  return data;
}

export async function upsertProfile(
  sb: SupabaseClient, profile: Partial<Profile> & { household_id: string },
): Promise<void> {
  const { error } = await sb.from("profiles").upsert(profile);
  if (error) throw error;
}

// ===== Cashflow =====
export async function getCashflowSummary(
  sb: SupabaseClient, householdId: string, limit = 12,
): Promise<CashflowSummary[]> {
  const { data, error } = await sb
    .from("v_cashflow_summary")
    .select("*")
    .eq("household_id", householdId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listMonths(
  sb: SupabaseClient, householdId: string,
): Promise<CashflowMonth[]> {
  const { data } = await sb
    .from("cashflow_months")
    .select("*")
    .eq("household_id", householdId)
    .order("year", { ascending: true })
    .order("month", { ascending: true });
  return data ?? [];
}

export async function listTx(
  sb: SupabaseClient, monthId: string,
): Promise<CashflowTx[]> {
  const { data } = await sb
    .from("cashflow_tx")
    .select("*")
    .eq("month_id", monthId)
    .order("tx_date", { ascending: false });
  return data ?? [];
}

export async function closeMonth(
  sb: SupabaseClient, monthId: string,
): Promise<void> {
  const { error } = await sb.rpc("close_month", { p_month_id: monthId });
  if (error) throw error;
}

// ===== Budget =====
export async function getBudgetVsActual(
  sb: SupabaseClient, householdId: string,
): Promise<BudgetVsActual[]> {
  const { data } = await sb
    .from("v_budget_vs_actual")
    .select("*")
    .eq("household_id", householdId);
  return data ?? [];
}

export async function upsertBudgetPlan(
  sb: SupabaseClient, plans: BudgetPlan[],
): Promise<void> {
  const { error } = await sb.from("budget_plan").upsert(plans);
  if (error) throw error;
}

// ===== Wealth Map =====
export async function getNetWorth(
  sb: SupabaseClient, householdId: string,
): Promise<NetWorth | null> {
  const { data } = await sb
    .from("v_net_worth")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();
  return data;
}

export async function listAssets(
  sb: SupabaseClient, householdId: string,
): Promise<Asset[]> {
  const { data } = await sb
    .from("assets")
    .select("*")
    .eq("household_id", householdId)
    .order("asset_group");
  return data ?? [];
}

export async function listLiabilities(
  sb: SupabaseClient, householdId: string,
): Promise<Liability[]> {
  const { data } = await sb
    .from("liabilities")
    .select("*")
    .eq("household_id", householdId)
    .order("liability_group");
  return data ?? [];
}

export async function upsertLiabilities(
  sb: SupabaseClient, liabilities: Partial<Liability>[],
): Promise<void> {
  const { error } = await sb.from("liabilities").upsert(liabilities);
  if (error) throw error;
}

// ===== Goals =====
export async function listGoals(
  sb: SupabaseClient, householdId: string,
): Promise<Goal[]> {
  const { data } = await sb
    .from("goals")
    .select("*")
    .eq("household_id", householdId)
    .order("target_date", { ascending: true });
  return data ?? [];
}

export async function upsertGoal(
  sb: SupabaseClient, goal: Partial<Goal> & { household_id: string; name: string; target_amount: number; target_date: string },
): Promise<void> {
  const { error } = await sb.from("goals").upsert(goal);
  if (error) throw error;
}

// ===== Tasks =====
export async function listOpenTasks(
  sb: SupabaseClient, householdId: string,
): Promise<Task[]> {
  const { data } = await sb
    .from("tasks")
    .select("*")
    .eq("household_id", householdId)
    .eq("status", "open")
    .order("severity", { ascending: false });
  return data ?? [];
}

export async function listAllTasks(
  sb: SupabaseClient, householdId: string,
): Promise<Task[]> {
  const { data } = await sb
    .from("tasks")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function upsertTasks(
  sb: SupabaseClient, tasks: Partial<Task>[],
): Promise<void> {
  const { error } = await sb
    .from("tasks")
    .upsert(tasks, { onConflict: "household_id,rule_id" });
  if (error) throw error;
}

export async function markTaskDone(
  sb: SupabaseClient, taskId: string,
): Promise<void> {
  const { error } = await sb
    .from("tasks")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw error;
}

// ===== Scenarios =====
export async function listScenarios(
  sb: SupabaseClient, householdId: string, kind?: string,
): Promise<Scenario[]> {
  let q = sb.from("scenarios").select("*").eq("household_id", householdId);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q.order("saved_at", { ascending: false });
  return data ?? [];
}

export async function saveScenario(
  sb: SupabaseClient, scenario: Omit<Scenario, "id" | "saved_at">,
): Promise<void> {
  const { error } = await sb.from("scenarios").insert(scenario);
  if (error) throw error;
}

// ===== Securities / Crypto / RSU / Options =====
export async function listSecurities(
  sb: SupabaseClient, householdId: string,
): Promise<SecurityValued[]> {
  const { data } = await sb
    .from("v_securities_valued")
    .select("*")
    .eq("household_id", householdId)
    .order("market_value_ils", { ascending: false });
  return data ?? [];
}

export async function upsertSecurity(
  sb: SupabaseClient, sec: Partial<Security> & { household_id: string; symbol: string; kind: Security["kind"] },
): Promise<void> {
  const { error } = await sb.from("securities").upsert(sec);
  if (error) throw error;
}

export async function deleteSecurity(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("securities").delete().eq("id", id);
  if (error) throw error;
}

// ===== Masleka =====
export async function listMaslekaFiles(
  sb: SupabaseClient, householdId: string,
): Promise<MaslekaFile[]> {
  const { data } = await sb
    .from("masleka_files")
    .select("*")
    .eq("household_id", householdId)
    .order("uploaded_at", { ascending: false });
  return data ?? [];
}

export async function listMaslekaEntries(
  sb: SupabaseClient, fileId: string,
): Promise<MaslekaEntry[]> {
  const { data } = await sb
    .from("masleka_entries")
    .select("*")
    .eq("file_id", fileId)
    .order("balance", { ascending: false });
  return data ?? [];
}

export async function recordMaslekaFile(
  sb: SupabaseClient, file: Omit<MaslekaFile, "id" | "uploaded_at" | "parsed_at" | "error_msg">,
): Promise<MaslekaFile> {
  const { data, error } = await sb.from("masleka_files").insert(file).select("*").single();
  if (error) throw error;
  return data;
}

/** Map a masleka entry to the household's `assets` table (auto-sourced). */
export async function promoteMaslekaToAsset(
  sb: SupabaseClient, entryId: string,
): Promise<void> {
  const { data: entry } = await sb.from("masleka_entries").select("*").eq("id", entryId).single();
  if (!entry) return;
  const { error } = await sb.from("assets").insert({
    household_id: entry.household_id,
    asset_group: "pension",
    name: `${entry.company ?? ""} — ${entry.product_type ?? ""}`.trim(),
    balance: entry.balance,
    auto_sourced: true,
  });
  if (error) throw error;
}
