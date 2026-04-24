#!/usr/bin/env node
/**
 * run-all-migrations.mjs
 *
 * Applies migrations 0001_*.sql … 0012_*.sql (in numerical order) to a target
 * Postgres/Supabase database. Use this to bootstrap a fresh Supabase project
 * for a new client/demo environment.
 *
 * Usage:
 *   DATABASE_URL="postgres://postgres:PW@db.xxxx.supabase.co:5432/postgres" \
 *     node scripts/supabase/run-all-migrations.mjs
 *
 * Notes:
 *   - The legacy `001_schema.sql` prototype is intentionally SKIPPED.
 *   - Each migration runs inside its own transaction. On failure we stop and
 *     leave previously-applied migrations committed (they're idempotent by
 *     design of the Supabase workflow — re-running should be safe).
 *   - Prints a concise status line per migration + final summary.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL env var is required.");
  console.error('   Example: DATABASE_URL="postgres://postgres:PW@db.xxx.supabase.co:5432/postgres"');
  process.exit(1);
}

// Match only the 4-digit prefixed migrations (skip 001_schema.sql prototype).
const MIGRATION_RE = /^\d{4}_.+\.sql$/;

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => MIGRATION_RE.test(f))
  .sort();

if (files.length === 0) {
  console.error(`❌ No migrations found in ${MIGRATIONS_DIR}`);
  process.exit(1);
}

console.log(`📂 Found ${files.length} migrations in ${MIGRATIONS_DIR}`);
console.log(`🎯 Target: ${maskUrl(DATABASE_URL)}`);
console.log("");

const client = new pg.Client({
  connectionString: DATABASE_URL,
  // Supabase requires SSL in production.
  ssl: DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

const results = [];
try {
  await client.connect();
  console.log("✅ Connected to database\n");

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(path, "utf8");
    const t0 = Date.now();
    process.stdout.write(`▶ ${file} ... `);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      const ms = Date.now() - t0;
      console.log(`✅ ${ms}ms`);
      results.push({ file, ok: true, ms });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("❌ FAILED");
      console.error(`\n   Error: ${err.message}`);
      if (err.position) console.error(`   Position: ${err.position}`);
      if (err.where) console.error(`   Where: ${err.where}`);
      results.push({ file, ok: false, error: err.message });
      break;
    }
  }
} finally {
  await client.end().catch(() => {});
}

console.log("\n────────────────────────────────────");
const ok = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const skipped = files.length - results.length;
console.log(`Summary: ${ok} ok, ${failed} failed, ${skipped} not-run`);
process.exit(failed > 0 ? 1 : 0);

function maskUrl(url) {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
}
