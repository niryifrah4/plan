# דוח בדיקת אבטחה — Plan App

**תאריך:** 10 ביוני 2026  
**פרויקט Supabase:** `xpkjpfxyjeurcokunsnm`  
**היקף:** schema ו-RLS ב-Supabase, RPC / view privileges, Auth hardening, runtime dependencies, ונתיבי API רגישים בצד השרת.

## תקציר מנהלים

הרצה של בדיקות מקומיות מול ה-DB החי והקוד העלתה שהבסיס ה-RLS ברובו תקין, אבל יש כמה נקודות טיפול ברורות:

1. פונקציות PII ב-Supabase פתוחות ל-`anon` / `authenticated`, והמפתח מחזיר fallback לא-מאובטח במקום סוד מנוהל.
2. `close_month` נגיש כ-RPC ציבורי ומאפשר סגירת חודש לפי `month_id` בלי בדיקת תפקיד.
3. Auth leaked password protection כבויה.
4. יש פגיעויות ידועות בתלויות runtime, כולל `next` ו-`xlsx`.
5. יש כמה hardening items ב-DB (view עם `SECURITY DEFINER`, `search_path` לא נעול).

### תמונת מצב

| חומרה | כמות |
|---|---:|
| Critical | 1 |
| High | 3 |
| Medium | 3 |
| Low | 2 |

## איך נבדק

- סריקת קוד מקומית על `app/`, `lib/`, `supabase/` ו-`package.json`.
- חיבור ל-Supabase החי דרך `supabase link` על בסיס `.env.supabase`.
- בדיקת `supabase db advisors --linked --type security --level warn`.
- שאילתות ישירות על `pg_proc`, `pg_policies`, `pg_extension`, ו-`current_setting(...)`.
- קריאות RPC מול ה-API הציבורי עם `anon` key.
- `npm audit` עם ובלי `--omit=dev`.

## ממצאים

### C-1: `next` בגרסה פגיעה עם advisory קריטי

**מה נמצא:** `package.json` נעול על `next@14.2.15`, ו-`npm audit` מחזיר advisory קריטי ל-Next.js.  
**המשמעות:** מדובר ברכיב ליבה של האפליקציה, ולכן זה לא רק dev-tooling. חלק מהאדבייזורז הם DoS / middleware / cache poisoning / SSRF-class issues.  
**המלצה:** לשדרג את Next.js לגרסה מתוקנת, לבדוק compat עם App Router / middleware / server actions, ואז להריץ שוב `npm audit` ו-build מלא.

---

### H-1: פונקציות PII פתוחות ציבורית והמפתח חוזר fallback לא-מאובטח

**מה נמצא:**
- `public.get_pii_key()` נגיש ל-`anon` ול-`authenticated`.
- גם `public.encrypt_pii(text)` ו-`public.decrypt_pii(text)` נגישות ל-`anon` ול-`authenticated`.
- ב-DB `current_setting('app.pii_encryption_key', true)` מחזיר `null`.
- כשאין סוד מוגדר, הפונקציה נופלת ל-key של פיתוח במקום לדרוש הגדרה אמיתית.
- הקריאה `encrypt_pii()` עצמה נשברת כרגע כי `pgcrypto` מותקן ב-`extensions`, אבל ה-`search_path` של הפונקציה הוא `pg_catalog, public` בלבד. כלומר `pgp_sym_encrypt` לא נמצא.

**למה זה חשוב:**
- המנגנון שמיועד להגן על תעודות זהות / PII לא באמת מאובטח.
- גם אם כרגע אין שורות עם `id_number_encrypted`, זה מצב לא תקין לפני הכנסת נתונים רגישים.

**הוכחת מצב חיה:**
- `get_pii_key()` דרך anon החזיר fallback dev-key.
- `encrypt_pii()` החזירה שגיאת resolution ל-`pgp_sym_encrypt`.

**המלצה:**
- לבטל `EXECUTE` ל-`anon` ול-`authenticated` על `get_pii_key`, `encrypt_pii`, `decrypt_pii`.
- להעביר את מפתח ההצפנה לסוד מנוהל אמיתי ב-DB / Vault ולא fallback קשיח בקוד.
- לתקן את ה-`search_path` או להוסיף schema qualification ל-`extensions.pgp_sym_encrypt` / `extensions.pgp_sym_decrypt`.
- להריץ בדיקת round-trip אחרי התיקון.

---

### H-2: `close_month` פתוחה ל-RPC ציבורי בלי בדיקת תפקיד

**מה נמצא:**
- `public.close_month(p_month_id uuid)` ניתנת לקריאה ע"י `anon` ו-`authenticated`.
- הפונקציה היא `SECURITY DEFINER`.
- אין בה בדיקת `auth.uid()`, אין בדיקת `advisor`, ואין gating נוסף.
- קריאה דרך anon ל-`close_month('00000000-0000-0000-0000-000000000000')` הגיבה מתוך ה-DB, מה שמוכיח שה-RPC עצמו נגיש.

**למה זה חשוב:**
- כל מי שמכיר `month_id` תקף יכול לנסות לסגור חודש, לעדכן `cashflow_months.closed`, ולגרום לרענון Goals.
- זה bypass על RLS כי הפונקציה רצה כ-definer.

**המלצה:**
- לבטל `EXECUTE` ל-`public` ולפתוח את הקריאה רק דרך route / service שיש בו בדיקת תפקיד.
- להוסיף בדיקת הרשאה בתוך הפונקציה עצמה, או להעביר את הפעולה ל-server route עם `requireUser` + בדיקת advisor/admin.

---

### H-3: תלויות runtime פגיעות

**מה נמצא ב-`npm audit --omit=dev`:**
- `next` עם advisory קריטי.
- `xlsx` עם advisory high על Prototype Pollution ו-ReDoS, וללא fix זמין כרגע.
- `qs`, `ws`, `fast-uri`, `brace-expansion`, `uuid`, `postcss` עם vulnerabilities נוספות.

**למה זה חשוב:**
- `next` הוא framework runtime.
- `xlsx` משמש ל-parsing של קבצי Excel בשרת, ולכן זה לא רק dev-time.

**המלצה:**
- לשדרג את `next` לגרסה מתוקנת.
- לשקול החלפה או בידוד של `xlsx` בצינור parsing.
- לעבור שוב על `npm audit` אחרי עדכון ה-lockfile.

---

### M-1: `check_account_lockout` חשופה לכולם ומדליפה מידע על email

**מה נמצא:**
- `public.check_account_lockout(p_email text)` ניתנת לקריאה ל-`anon` ול-`authenticated`.
- הקריאה מחזירה boolean על סמך ניסיונות כושלים ב-`session_events`.
- בדיקה חיה דרך anon החזירה תשובה תקינה.

**למה זה חשוב:**
- זה מאפשר probing של כתובות אימייל וחשיפת סטטוס חשבון / lockout בלי אימות.
- אם הפונקציה לא משמשת בפועל, אין סיבה להשאיר אותה פתוחה.

**המלצה:**
- להגביל ל-`authenticated` או למהלך פנימי של auth בלבד.
- אם לא משתמשים בזה, להסיר את ה-RPC ואת ה-privileges.

---

### M-2: Supabase Auth - Leaked Password Protection כבוי

**מה נמצא:** `supabase db advisors` מחזיר advisory על `auth_leaked_password_protection` כבוי.  
**למה זה חשוב:** זה חוסם שימוש בסיסמאות שנחשפו בדליפות מוכרות.  
**המלצה:** להפעיל את ההגנה ב-Dashboard של Supabase Auth.

---

### M-3: `v_merchant_category_rules` מוגדרת כ-`SECURITY DEFINER`

**מה נמצא:**
- ה-view `public.v_merchant_category_rules` מוגדר כ-security definer.
- `anon` לא יכול לקרוא אותו, ו-`authenticated` כן.
- ה-base table (`merchant_category_votes`) כבר חשופה לכל authenticated, כך שה-impact הנוכחי מוגבל.

**למה זה חשוב:**
- `SECURITY DEFINER` ל-view מעלה סיכון עקיפה של RLS אם מדיניות עתידית תשתנה.

**המלצה:**
- להעביר את ה-view ל-`security_invoker = on`.
- לשמור את ה-aggregation logic, אבל לתת ל-RLS של הטבלאות הבסיסיות לאכוף הרשאות.

---

### L-1: `project_goal_fv` ו-`tg_touch_updated_at` עם `search_path` mutable

**מה נמצא:**
- `public.project_goal_fv` ו-`public.tg_touch_updated_at` סומנו ע"י Supabase על `search_path` לא מוגדר.

**למה זה חשוב:**
- זה hardening issue קלאסי, לא בהכרח exploit מיידי כאן, אבל עדיף לנעול `search_path` מפורש בכל פונקציה.

**המלצה:**
- להוסיף `SET search_path TO pg_catalog, public` או schema qualification לפי הצורך.

---

## מצב ה-RLS וה-views

מהבדיקה החיה:

- רוב הטבלאות המרכזיות (`clients`, `households`, `client_state`, `documents`, `assets`, `audit_logs`, `session_events`) אכן עם `RLS` פעיל.
- ה-storage policies ל-`docs` נראות scoped ל-`owns_household(...)`.
- viewים רבים כבר עברו ל-`security_invoker = on`.

זה אומר שהבסיס טוב, אבל יש עדיין כמה חריגים שדורשים טיפול.

## צעדי טיפול מומלצים

1. לסגור מיד את `get_pii_key` / `encrypt_pii` / `decrypt_pii`.
2. להגן על `close_month`.
3. להפעיל leaked password protection ב-Supabase Auth.
4. לטפל ב-`next` וב-`xlsx` לפני deployment נוסף.
5. להמיר את `v_merchant_category_rules` ל-`security_invoker`.
6. להקשיח `search_path` בפונקציות שנותרו.

## הערת אימות

הבדיקה מול Supabase בוצעה על הפרויקט החי, ולא רק על המיגרציות המקומיות.  
במקביל, ניסיון ה-MCP המובנה בסשן הזה לא היה מחובר עם token תקין, ולכן האימות מול Supabase נעשה דרך ה-CLI המחובר לאותו project ref.
