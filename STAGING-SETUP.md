# Staging Environment Setup

> **Status (2026-05-21):** Staging does not exist yet. Real client data is in prod.
> Every push to `main` auto-deploys to live. This is the procedure to add a safety net.

---

## Why staging

Today every push touches the live system the real client is using. With staging:

1. Push to a `staging` branch → Vercel builds a preview URL.
2. Playwright smoke tests run automatically against the preview.
3. Only after staging is green, manually merge `staging` → `main` (triggers prod deploy).

This catches build-breaking issues, hydration errors, and obvious regressions BEFORE the live client sees them.

---

## One-time setup (~45 min total)

### 1. Supabase staging project (~10 min)

Create a separate Supabase project — same tables, same RLS, empty data:

```bash
# Manual steps in Supabase dashboard:
# 1. dashboard.supabase.com → New Project → Name: "plan-staging"
# 2. Choose same region as prod (Frankfurt/eu-central-1) for fair latency tests.
# 3. Free tier is enough for staging.
# 4. Wait ~2 minutes for provisioning.
# 5. Save:
#    NEXT_PUBLIC_SUPABASE_URL=https://STAGING_REF.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#    SUPABASE_SERVICE_ROLE_KEY=...
#    DATABASE_URL=postgresql://postgres.STAGING_REF:...@aws-...pooler.supabase.com:6543/postgres
```

Then apply migrations to staging in order:

```bash
cd plan-app
# DATABASE_URL must point to STAGING, not prod
DATABASE_URL="postgres://postgres.STAGING_REF:...@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  node scripts/apply-migrations.cjs
```

Verify all 19 migrations applied (0001 → 0019):

```sql
-- in staging SQL editor:
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

### 2. Vercel preview deployments (~15 min)

Connect the same GitHub repo to Vercel (separate from Render):

```bash
# Manual steps in Vercel dashboard:
# 1. vercel.com → New Project → import from GitHub → niryifrah4/plan
# 2. Framework preset: Next.js (auto-detected)
# 3. Build & Output Settings: keep defaults
# 4. Environment Variables — set ALL of these scoped to "Preview" only:
#      NEXT_PUBLIC_SUPABASE_URL        = STAGING URL
#      NEXT_PUBLIC_SUPABASE_ANON_KEY   = STAGING anon
#      SUPABASE_SERVICE_ROLE_KEY       = STAGING service_role
#      DATABASE_URL                    = STAGING database URL
#      RESEND_API_KEY                  = use the same key (with a "[staging]" prefix on subject in code if you want)
#      NEXT_PUBLIC_BASE_URL            = leave blank — Vercel injects per-preview URL
#      NODE_ENV                        = production
# 5. Settings → Git → Production Branch = main (so previews are NOT on main)
# 6. Settings → Git → Preview Deployment Branches = "all"
```

Now every push to a non-main branch creates a `https://plan-<branch>-<hash>.vercel.app` preview.

### 3. Wire Playwright to staging (~5 min)

The codebase already supports `PW_BASE_URL` (see `playwright.config.ts:21`). Run:

```bash
PW_BASE_URL=https://plan-<branch>-<hash>.vercel.app npx playwright test
```

For CI on GitHub Actions (future):

```yaml
# .github/workflows/staging-smoke.yml (NOT yet created)
on:
  pull_request:
    branches: [main]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: PW_BASE_URL=${{ vars.STAGING_URL }} npx playwright test
```

---

## Daily workflow (after setup)

```
# Work locally
git checkout -b staging-fix-something
# ... make changes ...
git push origin staging-fix-something

# Vercel auto-builds → URL appears in GitHub PR
# Playwright runs against that URL (when GH Action is added) OR
# run manually:  PW_BASE_URL=<vercel-preview-url> npx playwright test

# If green: merge PR to main → Render auto-deploys to prod
# If red: fix on the branch, push again, preview rebuilds
```

---

## What this protects against

| Risk before staging                                | With staging       |
| -------------------------------------------------- | ------------------ |
| TS error slips past `ignoreBuildErrors: true`      | Caught in preview  |
| Hydration mismatch only shows in prod              | Caught in preview  |
| RLS regression on a new migration                  | Caught in preview  |
| `text-[10px]` bulk-rename breaks 50 layouts        | Visual preview URL |
| Untested branch pushed accidentally to main        | Branch ≠ main      |

---

## What this does NOT protect against

- Schema drift between prod and staging (mitigation: re-run migrations on staging weekly)
- Real-data-specific bugs (staging is empty — manually seed if needed)
- Render-specific issues (staging is on Vercel, prod on Render — different runtimes)

---

## When to skip staging and ship straight to main

- Hotfix on prod-down (server is 500 right now)
- Pure docs / comments / dead-code removal
- Memory file updates (CLAUDE.md, MEMORY.md)

For everything else — staging first.
