import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => path.join(root, "supabase/migrations", file));
const sql = migrationFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const failures = [];

if (!/enable\s+row\s+level\s+security/i.test(sql)) failures.push("No RLS enable statement found");
if (!/upsert_client_state/i.test(sql)) failures.push("Canonical client-state RPC missing");
if (!/revoke\s+all\s+on\s+function\s+public\.upsert_client_state/i.test(sql)) failures.push("Client-state RPC is not explicitly revoked from public/anon");
if (!/grant\s+execute\s+on\s+function\s+public\.upsert_client_state[\s\S]*?authenticated/i.test(sql)) failures.push("Client-state RPC is not explicitly granted to authenticated");

const frontendFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) frontendFiles.push(full);
  }
}
walk(path.join(root, "frontend"));
for (const file of frontendFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (/SUPABASE_SERVICE_ROLE_KEY|supabase\/admin|createAdminClient/.test(source)) {
    failures.push(`Privileged Supabase reference in frontend: ${path.relative(root, file)}`);
  }
}

const server = read("backend/src/server.ts");
for (const marker of ["helmet(", "rateLimit(", 'express.json({ limit: "2mb"', "internal_error"]) {
  if (!server.includes(marker)) failures.push(`API hardening marker missing: ${marker}`);
}

if (failures.length) {
  console.error("Security baseline failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Security baseline passed (${migrationFiles.length} migrations, ${frontendFiles.length} frontend files scanned).`);
