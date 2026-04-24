#!/usr/bin/env node
/**
 * reset-db.mjs — ⚠️  DESTRUCTIVE
 *
 * Wipes the target database clean:
 *   1. Deletes ALL users in auth.users (via service_role API)
 *   2. Drops the public schema and all its objects
 *   3. Recreates an empty public schema ready for migrations
 *   4. Also resets the `storage` bucket objects if present
 *
 * Does NOT touch Supabase-managed schemas (auth structure, storage structure).
 *
 * Required env vars:
 *   DATABASE_URL              — postgres://...
 *   SUPABASE_URL              — https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key
 *
 * Typed confirmation required: set CONFIRM=RESET to actually run.
 */

import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const need = (k) => {
  if (!process.env[k]) { console.error(`❌ Missing ${k}`); process.exit(1); }
  return process.env[k];
};

if (process.env.CONFIRM !== "RESET") {
  console.error("❌ Refusing to run without CONFIRM=RESET");
  console.error('   Usage:  CONFIRM=RESET node scripts/supabase/reset-db.mjs');
  process.exit(1);
}

const DATABASE_URL = need("DATABASE_URL");
const SUPABASE_URL = need("SUPABASE_URL");
const SERVICE_KEY  = need("SUPABASE_SERVICE_ROLE_KEY");

const mask = (u) => u.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
console.log(`🧨 Target: ${mask(DATABASE_URL)}`);

// ─── 1. Delete all auth users ───
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
{
  let page = 1, total = 0;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error("❌ listUsers:", error.message); process.exit(1); }
    if (!data?.users?.length) break;
    for (const u of data.users) {
      const { error: delErr } = await sb.auth.admin.deleteUser(u.id);
      if (delErr) console.warn(`   ⚠️  failed to delete ${u.email}: ${delErr.message}`);
      else total++;
    }
    if (data.users.length < 200) break;
    page++;
  }
  console.log(`✅ Deleted ${total} auth user(s)`);
}

// ─── 2. Drop + recreate public schema ───
const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
try {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
    GRANT ALL ON SCHEMA public TO authenticated;
    GRANT ALL ON SCHEMA public TO service_role;
    GRANT ALL ON SCHEMA public TO anon;
    COMMENT ON SCHEMA public IS 'standard public schema';
  `);
  console.log("✅ Dropped + recreated public schema");

  // Empty storage objects (bucket will be recreated by migrations)
  try {
    await client.query(`DELETE FROM storage.objects;`);
    console.log("✅ Cleared storage.objects");
  } catch (e) {
    console.log(`ℹ️  storage.objects not cleared (${e.message.split('\n')[0]})`);
  }
} finally {
  await client.end();
}

console.log("\n✅ Reset complete. Now run: node scripts/supabase/run-all-migrations.mjs");
