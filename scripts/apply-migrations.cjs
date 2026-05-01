#!/usr/bin/env node
/**
 * Apply the bundled migration to the production database.
 *
 * Usage:
 *   node scripts/apply-migrations.cjs
 *
 * Reads DATABASE_URL from .env.local. The bundle file already concatenates
 * 0011 → 0015 in the right order. All statements are idempotent so re-runs
 * are safe.
 */

const fs = require("fs");
const path = require("path");

// Load env
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL missing from .env.local");
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "_apply_all_2026_04_30.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`▶ Reading ${path.basename(sqlPath)} (${sql.length} chars)`);

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },  // Supabase requires SSL but uses pooler cert
  });

  try {
    await client.connect();
    console.log("▶ Connected to database");

    await client.query(sql);
    console.log("✅ Migration applied successfully");

    // Smoke verify
    const tables = await client.query(`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('client_users','client_invites','client_state','households','advisors')
      order by table_name
    `);
    console.log("✅ Tables present:", tables.rows.map(r => r.table_name).join(", "));

    const policies = await client.query(`
      select policyname, tablename from pg_policies
      where schemaname = 'public' and tablename = 'client_state'
      order by policyname
    `);
    console.log("✅ client_state policies:", policies.rows.map(r => r.policyname).join(", "));
  } catch (e) {
    console.error("❌ Migration failed:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
