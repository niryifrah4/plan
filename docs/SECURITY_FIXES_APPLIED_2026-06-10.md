# תיעוד תיקוני אבטחה - 10 ביוני 2026

מסמך זה מרכז את פעולות התיקון שבוצעו בעקבות מסמך בקרת האבטחה `SECURITY_AUDIT_2026-06-10.md`.

## שינויים במסד הנתונים
נוצר קובץ המיגרציה `supabase/migrations/20260610160950_security_audit_fixes.sql`.

**פעולות עיקריות במיגרציה:**
1. **חסימת הרשאות ציבוריות:** הוסרו הרשאות ה-EXECUTE למשתמשי `public` ו-`anon` מפונקציות רגישות (מפתחות הצפנה, סגירת חודש, בדיקת חשבון):
   - `get_pii_key`, `encrypt_pii`, `decrypt_pii`
   - בנוסף, פונקציות ההצפנה שוכתבו כדי **להסיר את מפתח הגיבוי הקשיח** (הן יקרסו באופן מאובטח אם לא מוגדר מפתח ב-DB), והוגדר `search_path` תקין להרחבת ה-`pgcrypto`.
   - `close_month`, `check_account_lockout`, `handle_new_auth_user`, `tg_audit_row_change`
2. **אבטחת שומרי הסף (RLS Helpers):** הפונקציות המרכזיות המשמשות את מדיניות האבטחה נחסמו מ-`anon` אך נשארו כ-SECURITY DEFINER כדי להמשיך ולאפשר גישה תקינה עבור RLS policies של המשתמשים המחוברים (`authenticated`):
   - `is_advisor_of`, `is_client_of`, `owns_household`
   - בפועל המיגרציה מבצעת `REVOKE` ל-`public` ול-`anon`, ואז `GRANT EXECUTE` מפורש ל-`authenticated`, כדי לשמור על RLS בלי לפתוח גישה לציבור.
3. **הקשחת Views ו-search_path:**
   - ה-View `v_merchant_category_rules` הומר ל-`SECURITY INVOKER`.
   - נקבע `search_path = public, pg_catalog` עבור הפונקציות `project_goal_fv` ו-`tg_touch_updated_at`.

## עדכוני תלויות
* חבילת `next` עודכנה לגרסה בטוחה בסדרת 14.x כדי לתקן פגיעות אבטחה שזוהתה על ידי `npm audit`.
* מערכת הבילד (`npm run build`) אומתה מחדש לאחר העדכון ונמצאה תקינה (ללא שבירות תאימות).

## פעולות הנדרשות בניהול ידני (Supabase Dashboard)
יש לבצע שני צעדים ידניים שלא הושלמו אוטומטית:

1. להדליק את **Auth Leaked Password Protection** דרך ההגדרות של Supabase:
   Dashboard > Authentication > Security > Enable Leaked Password Protection.
2. ליצור Secret ב-Vault בשם `pii_encryption_key` עם מפתח אקראי חזק, כדי ש-`public.get_pii_key()` יוכל לקרוא אותו.
