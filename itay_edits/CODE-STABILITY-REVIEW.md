# סקירת יציבות קוד — מסקנות ליישום

**תאריך:** 2026-06-12
**היקף:** ~344 קבצי TS/TSX ב־`app/`, `components/`, `lib/`, `hooks/`, plus תצורת build ו־API routes.

הסקירה מדורגת לפי חומרה: 🔴 קריטי (יכול לגרום לאובדן/דליפת נתונים או קריסה בפרודקשן), 🟠 גבוה, 🟡 בינוני.

---

## 🔴 1. שמירה לשרת היא Fire-and-Forget — אובדן נתונים שקט

**איפה:** `lib/sync/blob-sync.ts` (`pushBlobInBackground`), וכל ה־stores שקוראים לה (`debt-store`, `budget-store`, `accounts-store` ועוד ~20).

**הבעיה:** כל שמירה כותבת ל־localStorage ואז דוחפת ל־Supabase ברקע בלי await, בלי retry, בלי תור offline ובלי שום חיווי למשתמש. אם ה־push נכשל (רשת, session פג, RLS) — הנתון קיים רק ב־localStorage של אותו דפדפן. מעבר מחשב/ניקוי דפדפן = הנתון נעלם, והמשתמש בטוח ששמר.

**ליישום:**
- להוסיף תור retry פשוט (מערך pending ב־memory + ניסיון חוזר עם backoff, flush ב־`visibilitychange`/`beforeunload` עם `navigator.sendBeacon` או `keepalive: true`).
- חיווי UI כשיש כתיבות שלא סונכרנו (badge "לא מסונכרן").
- לוג ל־Sentry על כל כשל push (כיום זה רק `console.warn`).

## 🔴 2. Last-Write-Wins בלי גרסאות — שני טאבים דורסים זה את זה

**איפה:** `client_state` upsert ב־`blob-sync.ts` וב־`app/api/sync/blob/route.ts`.

**הבעיה:** הבלוב כולו נדרס בכל שמירה. שני טאבים פתוחים (או יועץ + לקוח באותו household) → העריכה האחרונה מוחקת את הקודמת בלי שאף אחד יודע. אין `updated_at` check ואין מיזוג.

**ליישום:** להוסיף עמודת `version`/`updated_at` ולדחות כתיבה כשהגרסה בשרת חדשה יותר (optimistic concurrency); במקרה קונפליקט — למשוך מחדש ולמזג או להציג שגיאה. לחלופין לפחות `BroadcastChannel` בין טאבים כדי לסנכרן עריכות מקומיות.

## 🔴 3. localStorage הוא מקור האמת — שביר מטבעו

**איפה:** כל שכבת ה־stores (`lib/*-store.ts`).

**הבעיה:**
- מכסת ~5MB — אצל לקוח עם הרבה תנועות/מסמכים `setItem` יזרוק `QuotaExceededError`, וכל ה־catch הריקים (ראו §5) יבלעו את זה. המשתמש "שומר" וכלום לא נשמר.
- מצב גלישה פרטית / Safari ITP מוחקים localStorage אחרי 7 ימים ללא ביקור.
- `hydrate*FromRemote` מחזיר `false` כשהשרת ריק **בלי לנקות את ה־cache המקומי** — זה כבר גרם לדליפת נתונים בין households בעבר (מתועד ב־`client-scope.ts`). התיקון (`wipeForTenantSwitch`) עובד, אבל הארכיטקטורה עדיין מסתמכת על כך שכל נקודת כניסה זוכרת לקרוא לו.

**ליישום:**
- לתפוס `QuotaExceededError` ספציפית ולהציג שגיאה למשתמש.
- לטווח ארוך: להפוך את Supabase למקור אמת יחיד ו־localStorage ל־cache בלבד (הכיוון של "Phase 3 typed tables" שכבר התחיל ב־debt-store — להשלים אותו).
- לרכז את לוגיקת ה־tenant-switch בנקודה אחת (middleware/context) במקום להסתמך על קריאות פזורות ל־`wipeForTenantSwitch`.

## 🔴 4. אפס ולידציית קלט ב־API routes (26/26 ללא zod)

**איפה:** כל `app/api/**/route.ts`. zod מותקן ב־package.json אבל לא בשימוש באף route.

**הבעיה:** גוף הבקשה נבדק ידנית ונקודתית (`typeof body?.key === "string"`), ולפעמים בכלל לא. ב־`sync/blob` ה־`value` נכנס כ־`as never` ישירות ל־DB — בלוב בכל גודל/צורה. route כמו `merchant-category-rules` עושה `JSON.parse` על קלט בלי סכימה. שינוי צורת נתון בצד לקוח ישבור שרת בלי הודעה ברורה.

**ליישום:** סכימת zod לכל route (`safeParse` + 400 עם פירוט). להגביל גודל body (למשל 1MB) ב־routes של בלובים. תבנית משותפת: `lib/api/validate.ts`.

## 🔴 5. 157 בלוקים של `catch {}` ריקים — כשלים נעלמים

**איפה:** בכל הפרויקט; ריכוזים גדולים ב־`lib/*-store.ts`, `app/(client)/budget/page.tsx`, `dashboard/page.tsx`, `ClientLayoutInner.tsx`.

**הבעיה:** כל שגיאה — parse של נתון פגום, quota, כשל רשת, באג אמיתי — נבלעת. כשמשהו נשבר בפרודקשן אין שום עקבות, גם לא ב־Sentry (שכבר מחובר!).

**ליישום:** מעבר גורף: כל `catch {}` יקבל לפחות `console.warn` + `Sentry.captureException` עם תגית של המודול. כלל ESLint `no-empty` עם `allowEmptyCatch: false` כדי שלא יחזור.

## 🟠 6. `JSON.parse` חשוף שמפיל דפים

**איפה (דוגמאות מאומתות):**
- `app/(client)/balance/CashflowTab.tsx:40` — `return raw ? JSON.parse(raw) : []` בלי try; ערך פגום ב־localStorage מפיל את הטאב כולו.
- `app/(client)/budget/page.tsx:786,802` — parse בתוך initializer של state; חריגה = מסך לבן בדף תקציב.
- `app/(client)/goals/page.tsx:52,68`, `pension/page.tsx:138`, `dashboard/page.tsx` (מספר מקומות).

**ליישום:** פונקציית עזר אחת `safeParse<T>(raw, fallback)` (כבר קיימת בערך ב־`onboarding/page.tsx:69` — להעביר ל־`lib/`) ולהחליף את כל ~30 הקריאות החשופות. בנוסף — Error Boundary ברמת כל route ב־`(client)` כדי שדף אחד שנשבר לא יראה כקריסת אפליקציה.

## 🟠 7. `ignoreBuildErrors` בפרודקשן (Render)

**איפה:** `next.config.mjs` — `typescript: { ignoreBuildErrors: !!process.env.RENDER }`.

**הבעיה:** ה־deploy בפרודקשן מדלג על type-check (בגלל OOM מתועד). ההגנה היחידה היא pre-push hook מקומי — שאפשר לעקוף (`--no-verify`, מחשב אחר, עריכה ב־GitHub). שגיאת טיפוס שכבר פעם אחת הפילה את פרודקשן (Step0Welcome) יכולה לחזור.

**ליישום:** להריץ `tsc --noEmit` כ־job נפרד ב־CI (GitHub Actions, לא בתוך build של Render) שחוסם merge ל־main. זה פותר גם את ה־OOM וגם את התלות ב־hook מקומי.

## 🟠 8. אכיפת הרשאות ב־`/api/sync/blob` נשענת על RLS בלבד

**איפה:** `app/api/sync/blob/route.ts`.

**הבעיה:** ה־route מקבל `householdId` מהלקוח וכותב אליו בלי לוודא שהמשתמש שייך/מייעץ ל־household הזה. כיום RLS על `client_state` (migrations 0014/0015/0017) הוא קו ההגנה היחיד. מספיק policy אחד רופף בעתיד (או route עתידי שישתמש ב־`lib/supabase/admin.ts` עם service role) כדי לקבל כתיבה חוצת־לקוחות.

**ליישום:** בדיקת שייכות מפורשת ב־route (query על `households`/`client_users`) בנוסף ל־RLS — defense in depth. כלל פרויקט: service-role client לעולם לא מקבל מזהים מהלקוח בלי אימות שייכות.

## 🟠 9. רשימות אירועים כפולות שמתבדרות

**איפה:** `lib/client-scope.ts` — `dispatchAllRefreshEvents` (17 אירועים) מול `dispatchStoreRefreshEvents` (20 אירועים).

**הבעיה:** הרשימות כבר לא זהות — `salary_profile`, `docs`, `portfolio`, `special-events`, `subscriptions_radar_exclusions` קיימים רק בשנייה. החלפת לקוח (`dispatchAllRefreshEvents`) לא מרעננת את ה־stores האלה → ייתכנו נתוני לקוח קודם על המסך עד reload. זה בדיוק סוג הבאג שכבר נשרפתם ממנו.

**ליישום:** קבוע אחד `STORE_REFRESH_EVENTS` ושתי הפונקציות נגזרות ממנו. עדיף עוד יותר: כל store רושם את האירוע שלו ב־registry מרכזי בעת import.

## 🟠 10. כשלי fetch בצד לקוח לא נבדקים

**איפה:** ~12 קריאות `fetch` בקומפוננטות, רק ~8 בדיקות `res.ok`. בנוסף `lib/anthropic-client.ts` ו־routes של categorize — ללא timeout/maxRetries מוגדרים.

**הבעיה:** תגובת 500 עם גוף שגיאה תיכנס ל־`res.json()` ותיכשל בהמשך עם שגיאה לא קשורה; קריאת AI תקועה תתלה בקשה ללא קצה.

**ליישום:** wrapper `fetchJson(url, opts)` שבודק `ok`, מפענח שגיאה ועושה timeout (`AbortSignal.timeout(30_000)`). ב־Anthropic SDK להגדיר `timeout` ו־`maxRetries` מפורשים.

## 🟡 11. קומפוננטות־ענק

**איפה:** `budget/page.tsx` (2,677 שורות), `dashboard/page.tsx` (2,532), `debt/page.tsx` (1,633).

**הבעיה:** עשרות `useState`/`useEffect` בקובץ אחד, לוגיקה עסקית מעורבבת ב־UI, parse של localStorage בתוך render path. כל שינוי קטן מסכן את הדף כולו וקשה לבדיקה.

**ליישום:** לא refactor גורף — אבל כשנוגעים בדף, לחלץ: (א) hooks של נתונים (`useBudgetData`) , (ב) לוגיקת חישוב ל־`lib/` עם בדיקות יחידה, (ג) תתי־קומפוננטות. דפוס `page-files/` שכבר קיים ב־onboarding/goals הוא הכיוון הנכון.

## 🟡 12. פרסור תאריכים ומספרים ללא הגנות

**איפה (דוגמאות):**
- `lib/debt-store.ts:337` — `loanElapsedMonths` מפצל `"YYYY-MM"` בלי ולידציה; פורמט אחר → `NaN` שמתפשט לחישובי הלוואות.
- מחשבוני toolbox — `parseFloat` על קלט משתמש בלי בדיקת `NaN` בחלק מהמקומות (ה־`ToolboxNumberField` החדש הוא צעד נכון — לוודא שכולם עוברים אליו).

**ליישום:** ולידציה בנקודת הכניסה (regex לתאריך, `Number.isFinite` אחרי כל parse) והחזרת ערך בטוח + אזהרה, לא `NaN` שקט.

## 🟡 13. תלויות עם סיכון ידוע

- `xlsx@0.18.5` — לחבילה יש פרצות ידועות ללא תיקון ב־npm (Prototype Pollution, ReDoS). מקבלים קבצים מהמשתמש וזה רץ בשרת. לשקול מעבר ל־`exceljs` או לגרסה מה־CDN הרשמי של SheetJS שמתוקנת.
- `pdf-parse@1.1.1` — לא מתוחזק שנים; עוטף pdf.js ישן. קלט PDF זדוני = קריסת route. לכל הפחות לעטוף ב־try + הגבלת גודל קובץ.
- 37 שימושי `as any` ו־casts כמו `as never` — לצמצם בהדרגה, כל אחד הוא חור בבדיקת הטיפוסים שה־CI (כשיהיה, §7) לא יתפוס.

## 🟡 14. CSP מתירני

**איפה:** `next.config.mjs` — `script-src 'unsafe-eval' 'unsafe-inline'`.

זה מבטל חלק גדול מההגנה של CSP מפני XSS. `unsafe-eval` נדרש רק ל־dev — אפשר להתנות בסביבה. `unsafe-inline` ניתן להחלפה ב־nonces (Next תומך). לא דחוף, אבל שווה כרטיס.

---

## סדר יישום מומלץ

| # | פעולה | מאמץ | סעיפים |
|---|-------|------|--------|
| 1 | CI עם `tsc --noEmit` שחוסם merge | קטן | 7 |
| 2 | `safeParse` משותף + החלפת JSON.parse חשופים + Error Boundaries | קטן–בינוני | 6 |
| 3 | דיווח Sentry בכל catch ריק + כלל ESLint | בינוני (מכני) | 5 |
| 4 | איחוד רשימות האירועים ב־client-scope | קטן | 9 |
| 5 | zod לכל ה־API routes + הגבלת גודל body | בינוני | 4, 8 |
| 6 | תור retry + חיווי "לא מסונכרן" ל־pushBlob | בינוני | 1 |
| 7 | optimistic concurrency על client_state | בינוני–גדול | 2 |
| 8 | המשך מיגרציה ל־typed tables (Supabase כמקור אמת) | גדול | 3 |
