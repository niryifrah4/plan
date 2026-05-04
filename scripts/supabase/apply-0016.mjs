#!/usr/bin/env node
/**
 * apply-0016.mjs — applies only migration 0016 (self-signup default flip).
 * One-shot script. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/supabase/apply-0016.mjs
 *   (loads .env.local automatically via dotenv)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_PATH = resolve(__dirname, "../../supabase/migrations/0016_self_signup_default.sql");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set. Add it to .env.local.");
  process.exit(1);
}

const sql = readFileSync(MIG_PATH, "utf8");
console.log(`📂 Loaded migration: ${MIG_PATH.split("/").pop()}`);
console.log(`📏 Size: ${sql.length} chars, ${sql.split("\n").length} lines`);
console.log(`🎯 Target: ${maskUrl(DATABASE_URL)}`);
console.log("");

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  console.log("✓ Connected to DB");

  // Sanity check pre-state
  const before = await client.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='households' and column_name='signup_source'
  `);
  console.log(
    `  signup_source column before: ${before.rows.length > 0 ? "EXISTS" : "missing"}`
  );

  // Apply migration
  console.log("⚡ Applying migration...");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("✓ Migration applied");

  // Verify post-state
  const after = await client.query(`
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='households' and column_name='signup_source'
  `);
  console.log(
    `  signup_source column after:  ${after.rows.length > 0 ? `EXISTS (${after.rows[0].data_type})` : "STILL MISSING (problem!)"}`
  );

  const fnCheck = await client.query(`
    select proname, prosrc from pg_proc
    where proname = 'handle_new_auth_user' and pronamespace = 'public'::regnamespace
  `);
  if (fnCheck.rows.length > 0) {
    const src = fnCheck.rows[0].prosrc;
    const hasSelfSignup = src.includes("self_signup");
    const hasSignupRole = src.includes("signup_role");
    console.log(`  handle_new_auth_user function: EXISTS`);
    console.log(`    has 'self_signup' branch:    ${hasSelfSignup ? "YES ✓" : "NO ✗"}`);
    console.log(`    has 'signup_role' branch:    ${hasSignupRole ? "YES ✓" : "NO ✗"}`);
  } else {
    console.log(`  handle_new_auth_user function: MISSING (problem!)`);
  }

  // Show how many rows got the default
  const rowCount = await client.query(`
    select signup_source, count(*)::int as n
    from public.households group by signup_source order by n desc
  `);
  console.log("");
  console.log("📊 Existing households by signup_source (after default backfill):");
  for (const r of rowCount.rows) {
    console.log(`    ${r.signup_source.padEnd(20)} ${r.n}`);
  }

  console.log("");
  console.log("✅ DONE.");
} catch (err) {
  console.error("");
  console.error("❌ Error during migration:");
  console.error(err.message);
  try {
    await client.query("ROLLBACK");
  } catch {}
  process.exit(1);
} finally {
  await client.end();
}

function maskUrl(url) {
  return url.replace(/:[^:@]+@/, ":***@");
}
