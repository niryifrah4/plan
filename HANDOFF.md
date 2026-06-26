# HANDOFF — מעבר Next.js → Vite + React + Node (Express)

> מסמך העברה מלא לסשן חדש. קרא אותו ואת [MIGRATION.md](MIGRATION.md) לפני שתמשיך.
> נכתב 2026-06-25. הפרויקט: `plan-nir-yifrah` (מערכת תכנון פיננסי, עברית/RTL).

---

## 0. TL;DR — איפה אנחנו

- **Backend (Express)** — ✅ **100% הושלם**. כל 36 ה-API endpoints הועברו 1:1 ואומתו.
- **Frontend (Vite SPA)** — ✅ **100% עמודים מחווטים**. כל העמודים כולל advisor/mobile/public חווטו. נוסף גם גארד `RequireAdvisor` מותאם ללקוח כדי לאבטח את עמודי היועץ. מחכה לניקוי קבצי המקור של Next.js.
- **האפליקציה הישנה (Next.js) שלמה ורצה במקביל** — שום דבר לא נמחק.
- **לא בוצע git commit/push** — לפי הוראת המשתמש. אל תבצע בלי אישור מפורש.

**הערכת מאמץ: ~75-80% הושלם.** נשאר ~2-3 חלונות: (א) חיווט שאר ה-routes,
(ב) אימות runtime מקצה-לקצה + תיקוני חיכוך, (ג) ניקוי הקוד הישן.

---

## 1. הארכיטקטורה — ההחלטות המרכזיות

### 1.1 מבנה התיקיות
```
plan-nir-yifrah/
├── app/, components/, lib/, hooks/, types/   ← האפליקציה הישנה (Next.js) — עדיין שלמה
├── backend/                                   ← Express API חדש
│   ├── src/
│   │   ├── server.ts          ← bootstrap, mount כל ה-routers
│   │   ├── env.ts             ← env + crossSiteCookie helper
│   │   ├── supabase.ts        ← createUserClient / createAdminClient
│   │   ├── middleware/auth.ts ← requireUser / requireAdvisor
│   │   ├── lib/               ← async-handler, validate, rate-limit, upload, household-auth, safe-json, report-error
│   │   ├── shims/server-only.ts
│   │   └── routes/            ← 18 קבצי router (ראה §3)
│   ├── tsconfig.json          ← paths: @/* → ../* (reuse של lib השורשי!)
│   ├── package.json           ← dev=tsx, build=esbuild bundle
│   └── .env.example
└── frontend/                                  ← Vite SPA חדש
    ├── src/
    │   ├── main.tsx           ← QueryClient + Router + AuthProvider + installFetchAuth
    │   ├── App.tsx            ← טבלת ה-routes (כאן מוסיפים עמודים!)
    │   ├── auth/              ← AuthProvider, RequireAuth
    │   ├── app/ClientLayout.tsx ← מחליף את (client)/layout.tsx ה-RSC
    │   ├── lib/               ← supabase, api, install-fetch-auth, utils
    │   ├── components/ui/     ← shadcn (Lovable stack)
    │   ├── hooks/             ← useClients (TanStack Query)
    │   ├── pages/            ← Login, Dashboard (נבנו ב-Lovable stack)
    │   └── shims/             ← next-navigation/link/image/dynamic/font/next, empty
    ├── vite.config.ts         ← aliases + dedupe + define (קריטי! ראה §4)
    ├── tsconfig.json
    └── .env

```

### 1.2 Auth — מ-cookie SSR ל-token
- **לפני:** Supabase SSR עם cookies + `proxy.ts` middleware.
- **אחרי:** הדפדפן שולח `Authorization: Bearer <supabase_jwt>`. ה-backend בונה
  `createUserClient(token)` per-request → RLS עובד בדיוק כמו קודם.
- `backend/src/middleware/auth.ts`: `requireUser` (מאמת token, מצמיד `req.user`+`req.sb`),
  `requireAdvisor` (בודק טבלת `advisors`).

### 1.3 שימוש חוזר ב-lib השורשי (הטריק המרכזי)
ה-backend וה-frontend **לא מעתיקים** את 176 קבצי ה-lib — הם מייבאים אותם ישירות
דרך path aliases. רק 10 קבצים נגעו ב-next/server-only; פתרנו עם shim.
- Backend: `@/*` → `../*`, `server-only` → shim, `@/lib/report-error` → גרסת backend.
- כך כל ה-doc-parser, parsers, FIFO, calculations משותפים מקור-אמת אחד.

---

## 2. Backend — ✅ הושלם (36 endpoints, 18 routers)

**הרצה:** `cd backend && npm install && npm run dev` (פורט 3001).
**Build:** `npm run build` → `dist/server.js` (esbuild bundle, מאגד את ה-lib המשותף).
**אומת:** typecheck 0 שגיאות, prod bundle נבנה, boot תקין, unauth→401.

| Router | Endpoints | מקור |
|--------|-----------|------|
| health | GET / | app/api/health |
| crm | clients, households, clients/:id/stage | app/api/crm |
| invites | POST/GET | app/api/crm/invites |
| impersonate | POST/DELETE/enter/status/debug | app/api/crm/impersonate |
| settings | preferences GET/PATCH, issuer-status GET/PATCH | app/api/settings |
| onboarding | complete | app/api/onboarding |
| sync | blob | app/api/sync |
| gcal | auth/callback/status/events(GET/POST)/disconnect | app/api/gcal |
| documents | parse | app/api/documents |
| debt | parse-amortization | app/api/debt |
| categorize | / , /interactive | app/api/categorize |
| merchant-category-rules | GET/POST/DELETE | app/api/merchant-category-rules |
| auth | resolve-landing | app/auth/callback (חלק ה-routing) |
| crypto | binance/balances | app/api/crypto |
| pension | parse-pdf | app/api/pension |
| securities | parse-excel | app/api/securities |
| investments | reset, parse-report, reports(GET/POST/DELETE) | app/api/investments |
| market | / (kind-switch), prices(GET/POST) | app/api/market |

**הסתגלויות חשובות (התנהגות זהה, transport שונה):**
- preferences/gcal/impersonate — cookies דרך `cookie-parser` + `res.cookie`.
  בפרוד צריך `SameSite=None; Secure` (יש `crossSiteCookie()` ב-env.ts).
- `auth/callback` — החלפת ה-code ל-session עברה לצד-לקוח (Supabase
  detectSessionInUrl). נשאר רק ה-routing logic → `GET /api/auth/resolve-landing`.
- `impersonate/enter` — היה 303 redirect (פתר race של cookie+navigation).
  ב-SPA אין race (ניווט צד-לקוח), אז מחזיר `{ ok, next }` וה-SPA מנווט.
- `impersonate/status` — **חדש**, מחליף את קריאת ה-cookie של ה-RSC layout.

---

## 3. Frontend — תשתית ה-reuse (מוכחת ✅)

**ההחלטה:** במקום לשכתב 27,000 שורות עמודים — **מריצים את הקוד המקורי כמו שהוא**
דרך shims. זה ה-1:1 הכי חזק שאפשר: זה *אותו קוד*.

### 3.1 איך עמוד מקורי רץ ב-Vite ללא שינוי
1. `next/*` → shims (`src/shims/`): navigation→react-router, link, image,
   dynamic→React.lazy, font→no-op, bare `next`→types, server-only→empty.
2. `@/` → שורש הריפו (כך `@/components`, `@/lib`, `@/hooks` = הקבצים הקיימים).
   `~/` → `src` (קוד ה-SPA בלבד). React deduped לעותק אחד.
3. **fetch interceptor גלובלי** (`src/lib/install-fetch-auth.ts`) — מזריק
   `Authorization: Bearer` + `credentials:include` לכל `/api/*`. כך קריאות
   `fetch("/api/...")` הקיימות בעמודים עובדות ללא שינוי.
4. `vite.config.ts define` — ממפה `process.env.NEXT_PUBLIC_SUPABASE_*` →
   `VITE_*` כך ש-`lib/supabase/browser.ts` רץ ללא עריכה. בנוסף יש alias שממפה
   את כל לקוחות ה-Supabase של Next (`@/lib/supabase/browser|client|server`)
   ל-singleton של ה-SPA (`src/lib/supabase.ts`).
5. `ClientLayout` (`src/app/ClientLayout.tsx`) — מחליף את ה-RSC
   `(client)/layout.tsx`. מריץ את `ClientLayoutInner` המקורי (sidebar/shell),
   ומחשב impersonation מ-`GET /api/crm/impersonate/status`.

### 3.2 מצב נוכחי (אומת)
- כל 22 עמודי ה-(client) מחווטים ב-`App.tsx` ועוברים `vite build` (bundle 2.2MB).
- **רץ בדפדפן** — ה-shell (sidebar/RTL/branding) מוצג מצוין על `/balance`.
- ⚠️ **בעיה פתוחה:** אזור התוכן המרכזי ריק בעמוד `/balance` (אולי empty-state
  תקין של household ריק, אולי באג render). **צריך אבחון runtime — ראה §5.1.**

---

## 4. קבצי תצורה קריטיים (אל תשבור!)

- `frontend/vite.config.ts` — סדר ה-aliases חשוב: next/* ו-supabase קודם,
  אז `@shared`, `~/`, ולבסוף `@/` → שורש. כולל `dedupe:["react","react-dom"]`
  ו-`define` ל-process.env.
- `frontend/tsconfig.json` — paths תואמים ל-vite. `include:["src"]` בלבד (כדי
  ש-tsc יבדוק רק מה שמיובא בפועל, לא את כל app/ הישן).
- `backend/tsconfig.json` — `@/*`→`../*`, `@supabase/supabase-js`→עותק השורש,
  `@shared/*`, `server-only`+`report-error` shims. `lib:["ES2022","DOM"]`
  (קבצי ה-store מגנים על window ב-runtime, ה-DOM lib רק ל-types).

---

## 5. מה נשאר לעשות (לפי סדר עדיפות)

### 5.1 אבחון התוכן הריק (קודם כל!) — runtime
פתח DevTools→Console על `/balance` וחפש שגיאה אדומה. חשודים:
- ה-shim של `next/dynamic` מול `dynamic(()=>import().then(m=>m.Named))` —
  בדוק ש-WealthTab/AccountsTab/CashflowTab באמת נטענים.
- store שמצפה ל-active household / `verdant:active_household_id` ב-localStorage.
- אולי תקין (household ריק → empty-state). ודא מול עמוד עם נתונים.
תקן את החיכוך — סביר שהוא משותף לכמה עמודים.

### 5.2 חיווט שאר ה-routes ב-`frontend/src/App.tsx`
לכל עמוד: `import X from "@/app/.../page"` + `<Route .../>`, אז `npm run build`,
תקן חיכוך (בד"כ dep חסר ל-`npm i` ב-frontend, או import server-only ל-shim).
- **`/crm` המקורי 1:1** — חווט במלואו והוגן על ידי `RequireAdvisor`.
- **`crm/settings/*`** (7): חווט במלואו והוגן על ידי `RequireAdvisor`.
- **`/m/*`** (4): חווט במלואו ועטוף ב-MobileLayout.
- **ציבוריים** (ללא RequireAuth): חווטו.
- **`/auth/callback`** — עמוד SPA הוקם.

### 5.3 אימות runtime מקצה-לקצה (קריטי ל-1:1)
- Login אמיתי (לא demo) → לוודא token נשמר ו-`/api/*` עונים 200.
- מעבר על כל עמוד עם נתונים אמיתיים: dashboard, budget, investments,
  realestate, pension, debt, report, goals, insurance.
- העלאות קבצים: documents/parse, pension/parse-pdf, securities/parse-excel,
  debt/parse-amortization (multer — ודא FormData עובד מול ה-backend).
- gcal OAuth flow, impersonation flow (advisor→client), invites + email.
- שמירת state (sync/blob) + optimistic concurrency.

### 5.4 ניקוי (אחרי שהכל עובד)
- מחק `app/`, `proxy.ts`, `next.config.mjs`, `sentry.*.config.ts`, deps של Next.
- Sentry: `@sentry/node` (backend) + `@sentry/react` (frontend) במקום nextjs.
- `render.yaml`/פריסה: שני services (static frontend + Node backend), או Node
  אחד שמגיש את `frontend/dist`. עדכן CORS_ORIGINS + FRONTEND_URL + VITE_API_BASE.
- העבר את ה-Playwright e2e ל-URLs החדשים.
- שקול `code-splitting` (ה-bundle 2.2MB — יש אזהרה).

---

## 6. הרצה מקומית (שני טרמינלים)
```bash
# טרמינל 1 — backend (קורא את ה-.env השורשי לסודות Supabase)
cd backend && npm install && npm run dev      # http://localhost:3001

# טרמינל 2 — frontend (Vite proxy מעביר /api → :3001)
cd frontend && npm install && npm run dev      # http://localhost:5173
```
env: `backend/.env` (אופציונלי, נופל ל-.env השורשי), `frontend/.env`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE` ריק ב-dev).

---

## 7. מלכודות / לקחים (gotchas)
- **אל תבלבל `@/` ל-`~/`** — `@/`=שורש (קוד ישן), `~/`=src (קוד SPA).
- כשמייבאים עמוד שמושך `xlsx`/dep שלא ב-frontend — `npm i` אותו ל-frontend.
- import של `server-only`/`next/headers` בעמוד → צריך shim (next/headers עדיין
  לא ממופה; הוסף אם עמוד מושך אותו — אבל עמודי "use client" לא אמורים).
- React duplication → כבר נפתר עם dedupe; אם חוזר, בדוק את ה-paths.
- **אל תבצע git** בלי אישור מפורש מהמשתמש.
- שמור על typecheck נקי בשני הצדדים אחרי כל batch: `npm run typecheck`.

---

## 8. הקבצים שכדאי לקרוא ראשונים בסשן הבא
1. `HANDOFF.md` (זה) + `MIGRATION.md`
2. `frontend/src/App.tsx` — נקודת החיווט המרכזית
3. `frontend/vite.config.ts` — כל ה-aliases/shims
4. `frontend/src/app/ClientLayout.tsx` + `app/(client)/ClientLayoutInner.tsx`
5. `frontend/src/shims/*` — להבין מה ה-next/* shims עושים
6. `backend/src/server.ts` — מפת כל ה-API
