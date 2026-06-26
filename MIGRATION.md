# Migration: Next.js → Vite + React + Node (Express)

Status snapshot. The legacy Next.js app (`app/`, root `lib/`, `components/`) is
**still intact and runnable** — `npm run dev` at the repo root. The new stack
lives in `frontend/` and `backend/` and is built incrementally alongside it.

## Architecture decision

The Next.js app used **cookie-based Supabase SSR** (`@supabase/ssr` +
`cookies()` + `proxy.ts` middleware). The split stack uses **token-based auth**:

```
Browser (Vite SPA)                Express backend
─────────────────                 ───────────────
supabase-js (localStorage)
  └─ access_token  ──Bearer──▶    requireUser middleware
                                    └─ createUserClient(token)  ← RLS as the user
```

- Frontend reads the session token and attaches `Authorization: Bearer <jwt>`
  via `frontend/src/lib/api.ts`.
- Backend validates it per-request in `backend/src/middleware/auth.ts`,
  building an RLS-scoped client — same security guarantees as the old
  `createServerClient()`, just token- not cookie-sourced.

## Done (scaffold + vertical slice, verified e2e)

- `backend/` — Express + TS. `requireUser` / `requireAdvisor` middleware,
  `createUserClient` / `createAdminClient`, async error handling, CORS.
  Ported routes: `/api/health`, `/api/crm/clients`.
- `frontend/` — Vite + React + Tailwind (reused config + `globals.css`),
  React Router, `AuthProvider`, `RequireAuth` guard, authed `apiFetch`.
  Ported pages: `Login`, `Dashboard` (CRM clients).
- Verified: typecheck (both), prod build, health through Vite proxy, 401 path,
  login renders with full design system.

## Running both

```bash
# terminal 1 — backend (reads root .env for Supabase secrets)
cd backend && npm install && npm run dev      # :3001

# terminal 2 — frontend (Vite proxies /api -> :3001)
cd frontend && npm install && npm run dev      # :5173
```

Env: `backend/.env` (optional, falls back to root `.env`), `frontend/.env`
(copy `NEXT_PUBLIC_SUPABASE_*` → `VITE_SUPABASE_*`). See the `.env.example`s.

## Backend port progress (task #4)

**Infra proven**: backend reuses the repo-root `lib/` via tsconfig `paths`
(`@/*` → `../*`), a `server-only` shim, `@shared/*` map, DOM lib (store files
guard `window` at runtime), and `@supabase/supabase-js` unified to the root
copy. Dev = `tsx` (honors paths); prod = `esbuild` bundle (`npm run build` →
single `dist/server.js`). File uploads use `multer` memory storage
(`src/lib/upload.ts`). Cookie flows use `cookie-parser`; the SPA `apiFetch`
sends `credentials: "include"`.

**Ported routers** (`backend/src/routes/`, 30 endpoints): health; crm (clients,
households, clients/:id/stage); invites (POST/GET); settings (preferences,
issuer-status); onboarding (complete); sync (blob); gcal (auth, callback,
status, events GET/POST, disconnect); documents (parse); debt
(parse-amortization); categorize (+interactive); merchant-category-rules
(GET/POST/DELETE); auth (resolve-landing — replaces the role-routing half of
app/auth/callback; OAuth code exchange is now client-side); crypto
(binance/balances); pension (parse-pdf); securities (parse-excel); investments
(reset, parse-report, reports GET/POST/DELETE); market (prices GET/POST). All
verified: typecheck 0 errors, prod bundle builds, boot OK, unauth→401.

**✅ Backend API port COMPLETE** — all 36 endpoints across 18 routers ported &
verified (typecheck 0 errors, prod bundle builds, boot OK, unauth→401). Added in
the final batch: market (kind-switch quote/quotes/fx/fx-date/macro/crypto proxy)
and crm/impersonate (POST/DELETE/enter/status/debug — security model preserved
1:1; `status` is a new SPA adapter for the old RSC cookie read, `enter` returns
JSON next-path for client-side nav instead of a 303).

## Remaining work

### Task #4 — port the other 30 API routes (`app/api/**/route.ts`)

Mechanical per route:
1. Create `backend/src/routes/<area>.ts`, mount in `server.ts`.
2. `export async function GET()` → `router.get("/path", asyncHandler(...))`.
3. `NextResponse.json(x, {status})` → `res.status(status).json(x)`.
4. `const sb = await createClient()` + `sb.auth.getUser()` →
   `router.use(requireUser)` then read `req.sb` / `req.user`.
5. Advisor-only? mount `requireAdvisor` (see `routes/crm.ts`).
6. File uploads (parse-pdf, parse-excel, etc.): use `multer` memory storage
   instead of `await req.formData()`.
7. Reusable business logic in root `lib/` that is framework-agnostic (parsers,
   FIFO, calculations) can be imported directly or moved under `backend/src/lib`.
   Anything importing `next/*` or `server-only` must be rewritten.

Route inventory: `find app -name route.ts`.

## Frontend page reuse infra (task #5) — PROVEN

Rather than rewrite 27k lines of pages, the SPA **reuses the original
app/(client) pages + components verbatim** via shims (true 1:1):

- **Aliases** (`vite.config.ts` + `tsconfig.json`): `@/` → repo ROOT (reused
  components/lib/hooks/types), `~/` → `src` (SPA-only infra), `@shared` →
  `lib/_shared`. React is de-duped to the frontend's single copy.
- **next/* shims** (`src/shims/`): `next/navigation` (react-router-backed),
  `next/link`, `next/image`, `next/dynamic`, `next/font/google`, bare `next`
  (types), `server-only` (empty). So reused code importing `next/*` runs as-is.
- **Global fetch auth** (`src/lib/install-fetch-auth.ts`): injects the Supabase
  Bearer + `credentials:include` on every `/api/*` fetch, so the existing raw
  `fetch("/api/...")` calls in reused pages work unchanged.
- **process.env define**: Vite maps `process.env.NEXT_PUBLIC_SUPABASE_*` →
  `VITE_*` so `lib/supabase/browser.ts` runs unedited.
- **ClientLayout** (`src/app/ClientLayout.tsx`): SPA replacement for the RSC
  `(client)/layout.tsx` guard. Reuses `ClientLayoutInner` (the real shell) and
  derives impersonation from `GET /api/crm/impersonate/status`.

**Verified**: `/settings` page routed end-to-end through `ClientLayout` +
`ClientLayoutInner` + `ClientShell` + `Sidebar` — typecheck 0 errors, build OK.

### Porting the remaining pages (mechanical)

For each `app/(client)/<x>/page.tsx`: add `import X from "@/app/(client)/<x>/page"`
and a `<Route path="/<x>" element={<X/>}/>` inside the ClientLayout group in
`src/App.tsx`. Then build; fix any per-page friction (usually a missing dep to
`npm i` into frontend, or a server-only import to shim). Pages still to route
(~38): dashboard, budget, investments, realestate, pension, debt, report, plan,
goals, insurance, onboarding, tools, roadmap, balance, deposits, equity,
retirement, files, admin/cities, settings/subscriptions, settings/hidden-merchants;
plus the `/crm/settings/*` advisor pages, the `/m/*` mobile shell, and the
public `/privacy` `/terms` `/login/forgot-password` `/login/reset-password`.
Also wire the SPA `/auth/callback` (Supabase detectSessionInUrl → call
`/api/auth/resolve-landing` → navigate).

### Frontend stack (Lovable conventions)

The frontend follows the **Lovable stack** — match these when porting pages:

- **UI**: shadcn/ui primitives in `src/components/ui/` (`Button`, `Card`,
  `Input`, `Label` exist; add more with the same pattern / `npx shadcn add`).
  `cn()` from `@/lib/utils`. Tokens (`bg-primary`, `text-muted-foreground`,
  `border-border`, …) are mapped to the Morning palette in `globals.css`.
- **Icons**: `lucide-react` (not Material Symbols).
- **Data**: TanStack Query — one hook per resource in `src/hooks/` (see
  `useClients.ts`), all calling the authed `api` from `@/lib/api`. No raw
  `useEffect`+fetch in pages.
- **Forms**: `react-hook-form` + `zod` + `@hookform/resolvers` (see `Login.tsx`).
- **Toasts**: `sonner` (`import { toast } from "sonner"`).

### Task #5 — port the other ~40 pages (`app/**/page.tsx`)

1. Add a `<Route>` in `frontend/src/App.tsx` (wrap protected ones in
   `RequireAuth`; advisor pages also check the advisors table client-side).
2. Move the page to `frontend/src/pages/`; rebuild UI with shadcn primitives
   + lucide icons (see `Dashboard.tsx` / `Login.tsx` as the reference idiom).
3. Strip `"use client"`, `next/navigation` → `react-router-dom`
   (`useNavigate`, `useParams`, `useSearchParams`), `next/link` → `<Link>`,
   `next/image` → `<img>`.
4. Server Components / server-side data loads → a TanStack Query hook in
   `src/hooks/` backed by `api.get/post`.
5. Move shared `components/` into `frontend/src/components/` as needed
   (strip server-only bits, swap to shadcn where it fits).
6. `app/layout.tsx` chrome already lives in `index.html` + `main.tsx`
   (fonts, QueryClientProvider, sonner Toaster, AuthProvider).

### Cleanup (after parity)

- Delete `app/`, `proxy.ts`, `next.config.mjs`, `sentry.*.config.ts`, Next deps.
- Wire Sentry via `@sentry/node` (backend) + `@sentry/react` (frontend).
- Update `render.yaml` / deploy: two services (static frontend + Node backend)
  or one Node service serving the built `frontend/dist`.
- Port Playwright e2e specs to the new URLs.
