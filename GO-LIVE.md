# GO LIVE — 15 דקות, לחיצה-אחר-לחיצה

**מטרה**: להעלות את המערכת לאוויר בלי להבין כלום בתוכן.
**זמן**: 15 דקות אם הכל זורם, 30 אם משהו עוצר.

---

## ⏱️ שלב 1 — Supabase (5 דקות)

### א. צור פרויקט Production

1. לך ל-[supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. שם: `plan-prod`
3. סיסמת DB — שמור במקום בטוח (תשתמש בה רק פעם אחת)
4. אזור: **Frankfurt (eu-central-1)** ← חשוב, latency לישראל
5. Free Tier מספיק ל-50 משתמשים (אם תרצה — Pro $25/חודש)
6. לחץ **Create new project** → המתן 2-3 דקות

### ב. הרץ את כל המיגרציות בלחיצה אחת

1. בפרויקט החדש → **SQL Editor** (משמאל)
2. **New query**
3. פתח את הקובץ הזה במחשב:
   `supabase/migrations/_apply_all_2026_04_30.sql`
4. העתק **את כל התוכן** והדבק ב-SQL Editor
5. לחץ **Run** (כפתור ירוק)
6. צריך לראות "Success. No rows returned." בכל בלוק

### ג. סגור הרשמה חופשית

1. **Authentication → Sign In / Up → Email**
2. כבה: **"Allow new users to sign up"** ❌
3. שמור

### ד. אסוף 3 ערכים

**Settings → API**:
- 📋 העתק **Project URL** — שמור בצד
- 📋 העתק **anon public** key — שמור בצד
- 📋 העתק **service_role** key — שמור בצד (הסוד הגדול ביותר, לא לשתף)

✅ Supabase מוכן.

---

## ⏱️ שלב 2 — Render (5 דקות)

### א. New Blueprint

1. [dashboard.render.com](https://dashboard.render.com) → **New + → Blueprint**
2. **Connect a repository** → בחר `niryifrah4/plan`
3. אם זו פעם ראשונה — תאשר ל-Render גישה ל-GitHub שלך
4. Render מזהה את `render.yaml` אוטומטית
5. שם: `plan-app` (כבר מוגדר)
6. לחץ **Apply**

### ב. הזן env vars

הפריסה תיכשל בפעם הראשונה — זה **צפוי**. תיכנס לשירות החדש שנוצר:

1. **Environment** tab (משמאל)
2. הוסף את 4 המפתחות מהשלב הקודם:

```
NEXT_PUBLIC_SUPABASE_URL = <ה-Project URL מ-1ד>
NEXT_PUBLIC_SUPABASE_ANON_KEY = <ה-anon key מ-1ד>
SUPABASE_SERVICE_ROLE_KEY = <ה-service_role key מ-1ד>
NEXT_PUBLIC_BASE_URL = https://plan-app-XXXX.onrender.com
```

(את `BASE_URL` תעדכן אחרי שתראה את ה-URL בפועל בשלב הבא.)

3. **Save Changes**

### ג. Deploy ראשון

1. **Manual Deploy → Deploy latest commit**
2. המתן 3-4 דקות (build + start)
3. סטטוס יהפוך ל-**Live** ✅

### ד. בדוק שזה עובד

ב-URL של השירות שלך (משהו כמו `https://plan-app-abc.onrender.com`):

- `/api/health` → צריך להחזיר `{"ok":true,...}`
- `/login` → צריך לטעון דף כניסה
- `/privacy` + `/terms` → צריכים להיטען

אם יש שגיאה — Render שמירת לוגים תחת **Logs** tab. שלח לי screenshot ואני פותר.

✅ Render מוכן.

---

## ⏱️ שלב 3 — חיבור סופי (5 דקות)

### א. עדכן `NEXT_PUBLIC_BASE_URL`

עכשיו שיש לך URL אמיתי, תחזור ל-Render → Environment → תעדכן:
```
NEXT_PUBLIC_BASE_URL = https://plan-app-abc.onrender.com
```
(לא לשכוח **Save Changes**.)

### ב. צור משתמש יועץ ראשון (אתה)

המערכת לא מאפשרת הרשמה רגילה (סגרנו). יש 2 דרכים:

**אופציה 1 (מומלצת — יועץ ראשי):**
1. Supabase → **Authentication → Users → Invite user**
2. אימייל שלך
3. תקבל מייל עם קישור — תלחץ → קבע סיסמה → תהפוך ליועץ אוטומטית

**אופציה 2 (admin SQL):**
1. Supabase → SQL Editor
2. הרץ:
```sql
-- Activate signups for 60 seconds
update auth.config set value = 'true' where key = 'enable_signup';
```
3. לך ל-`https://your-render-url.onrender.com/login?signup=1`
4. הירשם
5. חזור ל-SQL וכבה:
```sql
update auth.config set value = 'false' where key = 'enable_signup';
```

### ג. שלח הזמנה ראשונה

1. התחבר עם המשתמש שלך → **/crm**
2. כפתור **"הזמן לקוח"**
3. שם + אימייל מבחן (אימייל שני שלך, או של אשתך)
4. הוסף שם משפחה
5. **שלח**
6. בדוק את האימייל הזה → לחץ קישור → קבע סיסמה
7. נחית על `/dashboard` כלקוח ✅

🎉 **המערכת חיה. תוכל להזמין לקוחות אמיתיים.**

---

## אופציונלי — דומיין מותאם

יש לך דומיין קיים (`plus-m.co.il`?)?

1. Render service → **Settings → Custom Domains → Add**
2. הזן `app.plus-m.co.il` (או מה שתבחר)
3. Render יראה לך **CNAME record** — תוסיף ל-DNS שלך
4. המתן 5 דק׳ → SSL מתחבר אוטומטי
5. עדכן `NEXT_PUBLIC_BASE_URL` בRender לדומיין החדש
6. Redeploy

---

## אם משהו נשבר

1. **Logs** ב-Render → קופי-פייסט של ההודעה האדומה הראשונה
2. **Functions Logs** ב-Supabase → קופי-פייסט של שגיאות
3. שלח לי + screenshot
4. אני מתקן ב-10 דקות

---

## אחרי Go-Live

ה-checklist הקצר לשבוע הראשון:
- [ ] בדוק 5 לקוחות מבחן (אתה + 4 אנשים שאתה סומך עליהם)
- [ ] עקוב Render Logs פעם ביום
- [ ] עקוב Supabase Logs
- [ ] אם יש Sentry — בדוק שגיאות חדשות
- [ ] אסוף feedback בWhatsApp ⇒ נתעדף תיקונים
