#!/usr/bin/env node
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const EMAIL = process.argv[2] || process.env.EMAIL;
if (!EMAIL) {
  console.error("Usage: EMAIL=user@example.com node scripts/supabase/reset-household-by-email.mjs");
  process.exit(1);
}

const env = fs.readFileSync(new URL("../../.env", import.meta.url), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] || "").replace(/^\"|\"$/g, "");
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: clientUser, error: clientUserError } = await sb
  .from("client_users")
  .select("user_id, household_id, full_name, email")
  .ilike("email", EMAIL)
  .maybeSingle();

if (clientUserError) throw clientUserError;

const { data: legacyClient, error: legacyClientError } = await sb
  .from("clients")
  .select("id, household_id, full_name, email")
  .ilike("email", EMAIL)
  .maybeSingle();

if (legacyClientError) throw legacyClientError;

const householdId = clientUser?.household_id || legacyClient?.household_id || null;

if (!householdId) {
  console.error(`No household found for ${EMAIL}`);
  process.exit(1);
}

console.log(`Resetting household ${householdId} for ${EMAIL}`);

const tableDeletes = [
  "client_state",
  "documents",
  "sync_logs",
  "pension_products",
  "pension_coverages",
  "risk_items",
  "properties",
  "mortgages",
  "consumer_loans",
  "installment_purchases",
  "assets",
  "liabilities",
  "goals",
  "tasks",
  "scenarios",
  "cashflow_months",
  "cashflow_tx",
  "budget_plan",
  "client_instruments",
  "masleka_entries",
  "masleka_files",
  "securities",
  "client_invites",
];

for (const table of tableDeletes) {
  const { error, count } = await sb
    .from(table)
    .delete({ count: "exact" })
    .eq("household_id", householdId);
  if (error) {
    console.error(`[${table}] delete failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`[${table}] deleted ${count || 0}`);
}

const { error: hhError } = await sb
  .from("households")
  .update({ family_name: "משפחה", stage: "onboarding", onboarded_at: null })
  .eq("id", householdId);

if (hhError) {
  console.error(`[households] update failed: ${hhError.message}`);
  process.exit(1);
}

console.log(`[households] reset stage to onboarding for ${householdId}`);

const { data: remaining } = await sb
  .from("client_state")
  .select("state_key", { count: "exact" })
  .eq("household_id", householdId);

console.log(`Remaining client_state rows: ${remaining?.length || 0}`);
