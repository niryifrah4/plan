import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * assertHouseholdAccess — defense-in-depth household ownership check.
 * Ported verbatim from lib/api/household-auth.ts (framework-agnostic).
 * Any route using a service-role client MUST call this before a write that
 * takes a client-supplied householdId.
 */
export async function assertHouseholdAccess(
  sb: SupabaseClient<any>,
  userId: string,
  householdId: string
): Promise<boolean> {
  if (!userId || !householdId) return false;

  const { data: member } = await sb
    .from("client_users")
    .select("household_id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (member?.household_id) return true;

  const { data: owned } = await sb
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("advisor_id", userId)
    .maybeSingle();
  return !!owned?.id;
}
