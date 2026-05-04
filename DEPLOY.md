# Deploy — Plan App on Render

Built 2026-04-30 ahead of go-live.

## Prerequisites

- ✅ GitHub repo: `https://github.com/niryifrah4/plan`
- ✅ Supabase project (production)
- ⏳ Render account (you already have one)
- ⏳ Custom domain (optional for first deploy)

---

## Step 1 — Apply Supabase migrations

Run these SQL files in order against the **production** Supabase project:

```
supabase/migrations/0011_client_users_and_invites.sql
supabase/migrations/0012_fix_client_policies_recursion.sql
supabase/migrations/0013_security_definer_search_path.sql
supabase/migrations/0014_client_state_rls_and_search_path.sql
supabase/migrations/0015_client_state_for_clients.sql
```

Easiest path: copy each file's contents → Supabase dashboard → SQL Editor → Run.

After migrations:

1. **Authentication → Providers → Email**
2. ❌ Disable **"Enable email signups"** (clients enter only via invite)
3. ✅ Keep **"Enable email logins"**
4. **Email Templates → Invite User** — customize subject/body in Hebrew if you want.

---

## Step 2 — Create the Render Web Service

In the Render dashboard:

1. **New + → Blueprint**
2. Connect your GitHub repo `niryifrah4/plan`
3. Render reads `render.yaml` and provisions one Web Service.
4. Click **Apply**.
5. The build will start, then fail on the first run because env vars aren't set yet — that's expected.

---

## Step 3 — Set environment variables

Go to the new service → **Environment** tab. Set:

| Key                             | Value                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | from Supabase project settings → API                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | same (this one is **secret**)                                          |
| `NEXT_PUBLIC_BASE_URL`          | `https://your-render-url.onrender.com` (or custom domain after step 4) |

Optional but recommended:

| Key                      | Value                              |
| ------------------------ | ---------------------------------- |
| `SENTRY_DSN`             | from Sentry project settings       |
| `NEXT_PUBLIC_SENTRY_DSN` | same as above                      |
| `RESEND_API_KEY`         | from Resend dashboard              |
| `RESEND_FROM`            | `Plan <noreply@your-domain.co.il>` |

After setting all → **Manual Deploy → Deploy latest commit**.

---

## Step 4 — Custom domain (optional, ~10 minutes)

1. In Render service → **Settings → Custom Domains → Add**
2. Enter `app.your-domain.co.il`
3. Add the DNS record Render shows (CNAME → `your-service.onrender.com`)
4. Wait for SSL provisioning (~2 minutes)
5. Update `NEXT_PUBLIC_BASE_URL` env var to the new domain → redeploy

---

## Step 5 — Smoke test

Once deployed:

1. Visit `https://app.your-domain.co.il/` — should redirect to `/login`.
2. `https://app.your-domain.co.il/api/health` — should return `{"ok":true,...}`.
3. `/privacy` and `/terms` should load without auth.
4. Try logging in with the advisor account you created on the test environment — should land on `/crm`.
5. From `/crm` → "הזמן לקוח" → enter a real email address you control.
6. Check that email in your inbox. Click the link → should land on `/auth/callback` → onboarding.

If any step fails, check Render logs (live tail under the service) and Supabase Auth logs.

---

## Step 6 — Sentry source maps (optional)

Once you have Sentry working:

1. Generate an auth token in Sentry → API → Auth Tokens with project:write scope.
2. Add to Render env: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
3. Redeploy. Builds will upload source maps so stack traces show real file/line numbers.

---

## Rollback

Render keeps every deploy. To roll back:

- Service dashboard → **Deploys** tab → click any prior green deploy → **Redeploy**.

---

## Cron job (price refresh) — deferred

Plan-app has a `/api/market/prices` endpoint that refreshes Yahoo + CoinGecko prices. To run it daily:

**Free option**: cron-job.org → set up a POST every weekday 16:00 UTC to:

```
https://app.your-domain.co.il/api/market/prices
Header: Authorization: Bearer <CRON_SECRET from Render env>
```

**Paid option**: Render Cron Job ($1/month). Add to `render.yaml` once everything else works.
