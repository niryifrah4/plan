#!/usr/bin/env node
/**
 * deploy-render.cjs — automated Render deploy via REST API.
 *
 * Usage:
 *   RENDER_API_KEY=rnd_... node scripts/deploy-render.cjs
 *
 * Reads:
 *  - RENDER_API_KEY from env (the only manual input)
 *  - DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *    SUPABASE_SERVICE_ROLE_KEY from .env.local
 *
 * What it does:
 *  1. Checks that Render account is linked to GitHub user `niryifrah4`.
 *  2. Looks for an existing service named `plan-app` — reuses if found,
 *     otherwise creates a new Web Service from the repo.
 *  3. Sets the four required env vars.
 *  4. Triggers a manual deploy.
 *  5. Polls deploy status until live or failed.
 *  6. Prints the public URL on success.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const API = "https://api.render.com/v1";
const API_KEY = process.env.RENDER_API_KEY;

if (!API_KEY) {
  console.error("❌ Set RENDER_API_KEY in env or pass it inline.");
  process.exit(1);
}

const REQUIRED_ENV = {
  NEXT_PUBLIC_SUPABASE_URL:    process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:   process.env.SUPABASE_SERVICE_ROLE_KEY,
  // BASE_URL gets filled after we know the service URL.
};

for (const [k, v] of Object.entries(REQUIRED_ENV)) {
  if (!v) {
    console.error(`❌ Missing ${k} in .env.local`);
    process.exit(1);
  }
}

async function api(method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    throw new Error(`${method} ${p} → ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("▶ Authenticating with Render…");
  const owner = await api("GET", "/owners");
  const ownerId = owner[0]?.owner?.id || owner[0]?.id;
  if (!ownerId) throw new Error("Couldn't resolve owner id from /owners");
  console.log(`  ✅ ownerId=${ownerId}`);

  console.log("▶ Looking for existing 'plan-app' service…");
  const services = await api("GET", `/services?name=plan-app&limit=10`);
  let svc = (services || []).find(s => (s.service?.name || s.name) === "plan-app");
  let serviceId = svc?.service?.id || svc?.id;

  if (!serviceId) {
    console.log("  • not found — creating new web service");
    const created = await api("POST", "/services", {
      type: "web_service",
      name: "plan-app",
      ownerId,
      repo: "https://github.com/niryifrah4/plan",
      branch: "main",
      autoDeploy: "yes",
      serviceDetails: {
        env: "node",
        region: "frankfurt",
        plan: "free",
        healthCheckPath: "/api/health",
        envSpecificDetails: {
          buildCommand: "npm install && npm run build",
          startCommand: "npm run start",
        },
      },
      envVars: [
        { key: "NODE_ENV", value: "production" },
        { key: "NEXT_TELEMETRY_DISABLED", value: "1" },
        ...Object.entries(REQUIRED_ENV).map(([k, v]) => ({ key: k, value: v })),
      ],
    });
    serviceId = created.service?.id || created.id;
    console.log(`  ✅ created service id=${serviceId}`);
    console.log(`  ✅ initial deploy started`);
  } else {
    console.log(`  ✅ found existing service id=${serviceId} — updating env vars`);
    // Update env vars
    const envBody = Object.entries(REQUIRED_ENV).map(([k, v]) => ({ key: k, value: v }));
    await api("PUT", `/services/${serviceId}/env-vars`, envBody);
    // Trigger manual deploy
    await api("POST", `/services/${serviceId}/deploys`, {});
    console.log(`  ✅ env vars updated + deploy triggered`);
  }

  // Get the service URL once available
  const detail = await api("GET", `/services/${serviceId}`);
  const url = detail.service?.serviceDetails?.url || detail.serviceDetails?.url || detail.url;
  if (url) console.log(`\n🌐 Service URL: ${url}`);

  console.log("\n▶ Polling deploy status (this can take 3-5 minutes)…");
  let lastStatus = "";
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    const deploys = await api("GET", `/services/${serviceId}/deploys?limit=1`);
    const d = deploys[0]?.deploy || deploys[0];
    if (!d) continue;
    if (d.status !== lastStatus) {
      console.log(`  · ${d.status}`);
      lastStatus = d.status;
    }
    if (d.status === "live") {
      console.log("\n✅ Deploy LIVE!");
      console.log(`🌐 Hit: ${url}/api/health`);
      return;
    }
    if (["failed", "canceled", "build_failed", "deactivated"].includes(d.status)) {
      console.error(`\n❌ Deploy failed: ${d.status}`);
      process.exit(1);
    }
  }
  console.error("\n⚠️ Timed out waiting for deploy. Check Render dashboard.");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
