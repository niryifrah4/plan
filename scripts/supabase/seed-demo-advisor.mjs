#!/usr/bin/env node
/**
 * seed-demo-advisor.mjs
 *
 * Bootstraps a fresh Supabase project with:
 *   1. An advisor auth user (email/password)
 *   2. A row in public.advisors linked to that user
 *   3. A sample household with family_name
 *   4. (Optional) a second demo client household
 *
 * Designed to run ONCE, right after `run-all-migrations.mjs`, on a clean DB.
 * Safe to re-run — uses upsert / lookup-before-create semantics.
 *
 * Required env vars:
 *   SUPABASE_URL                 — https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    — service_role key (NOT anon)
 *   ADVISOR_EMAIL                — e.g. nir@plan.co.il
 *   ADVISOR_PASSWORD             — initial password (rotate after first login)
 *   ADVISOR_NAME                 — e.g. "ניר יפרח"
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     ADVISOR_EMAIL=nir@plan.co.il ADVISOR_PASSWORD=... ADVISOR_NAME="ניר יפרח" \
 *     node scripts/supabase/seed-demo-advisor.mjs
 */

import { createClient } from "@supabase/supabase-js";

const env = (k, required = true) => {
  const v = process.env[k];
  if (required && !v) {
    console.error(`❌ Missing env var: ${k}`);
    process.exit(1);
  }
  return v;
};

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const ADVISOR_EMAIL = env("ADVISOR_EMAIL");
const ADVISOR_PASSWORD = env("ADVISOR_PASSWORD");
const ADVISOR_NAME = env("ADVISOR_NAME");
const SEED_DEMO_HOUSEHOLD = (process.env.SEED_DEMO_HOUSEHOLD ?? "true") !== "false";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`🌱 Seeding demo advisor on ${SUPABASE_URL}\n`);

// ─── 1. Create or locate auth user ──────────────────────────────────────────
let userId;
{
  process.stdout.write(`▶ Ensuring auth user ${ADVISOR_EMAIL} ... `);
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === ADVISOR_EMAIL.toLowerCase());

  if (existing) {
    userId = existing.id;
    console.log(`ℹ️  already exists (${userId})`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: ADVISOR_EMAIL,
      password: ADVISOR_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADVISOR_NAME, role: "advisor" },
    });
    if (error) {
      console.log("❌");
      console.error(`   ${error.message}`);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`✅ created (${userId})`);
  }
}

// ─── 2. Upsert public.advisors row ──────────────────────────────────────────
{
  process.stdout.write(`▶ Upserting advisors row ... `);
  const { error } = await sb
    .from("advisors")
    .upsert({ id: userId, email: ADVISOR_EMAIL, full_name: ADVISOR_NAME }, { onConflict: "id" });
  if (error) {
    console.log("❌");
    console.error(`   ${error.message}`);
    console.error(`   (If columns differ, adjust the upsert payload in this script.)`);
    process.exit(1);
  }
  console.log("✅");
}

// ─── 3. Sample household (optional) ─────────────────────────────────────────
if (SEED_DEMO_HOUSEHOLD) {
  process.stdout.write(`▶ Creating sample household ... `);
  const { data: existing } = await sb
    .from("households")
    .select("id")
    .eq("advisor_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(`ℹ️  already has household (${existing.id})`);
  } else {
    const { data, error } = await sb
      .from("households")
      .insert({ advisor_id: userId, family_name: "משפחה לדוגמה" })
      .select("id")
      .single();
    if (error) {
      console.log("❌");
      console.error(`   ${error.message}`);
      process.exit(1);
    }
    console.log(`✅ (${data.id})`);
  }
}

console.log("\n────────────────────────────────────");
console.log("✅ Seed complete.");
console.log(`   Login at /login with: ${ADVISOR_EMAIL}`);
console.log(`   (Rotate the password after first login.)`);
