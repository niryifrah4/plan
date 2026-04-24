# DEMO-READINESS — פגישה יום רביעי

מסמך זה הוא הצ'קליסט המלא לקראת הפגישה עם הלקוח ה"קל" יום רביעי.
הפגישה ב-Zoom עם screen-share מ-localhost, לא פרודקשן ציבורי.

---

## 🎯 מטרה

להריץ את המערכת על **פרויקט Supabase נפרד** ("client-001") שמנותק לחלוטין מה-DB של הפיתוח, כדי שלא נזהם דאטה אמיתית ולא נחשוף בטעות לקוחות אחרים.

---

## 📋 לפני הפגישה — שלבים

### 1. פתיחת פרויקט Supabase חדש (5 דק')

- [ ] היכנס ל- https://supabase.com/dashboard
- [ ] "New project" → שם: `plan-client-001`
- [ ] Region: `eu-central-1` (Frankfurt) — הכי קרוב ללקוח
- [ ] Password: חזק, שמור ב-password manager
- [ ] חכה ~2 דק' עד שהפרויקט קם

### 2. איסוף credentials

מתוך Settings של הפרויקט:
- [ ] **Settings → API** — העתק `URL`, `anon key`, `service_role key`
- [ ] **Settings → Database → Connection string → URI** — העתק (זה ה-`DATABASE_URL`)

### 3. עדכון `.env.local`

```bash
cp .env.local .env.local.dev.backup              # גיבוי הסביבה הנוכחית
cp .env.local.client-001.example .env.local.client-001
# ערוך את .env.local.client-001 והכנס את הערכים מסעיף 2
cp .env.local.client-001 .env.local
```

### 4. הרצת migrations (30 שניות)

```bash
export DATABASE_URL="postgres://postgres:PW@db.xxx.supabase.co:5432/postgres"
node scripts/supabase/run-all-migrations.mjs
```

אמור לראות 12 ✅ ירוקים (0001 עד 0012).

### 5. יצירת משתמש advisor + משפחה לדוגמה

```bash
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
export ADVISOR_EMAIL="nir@plan.co.il"
export ADVISOR_PASSWORD="<strong-password>"
export ADVISOR_NAME="ניר יפרח"
node scripts/supabase/seed-demo-advisor.mjs
```

### 6. Snapshot של מצב בסיס נקי

```bash
./scripts/supabase/snapshot.sh baseline-client-001
```

הקובץ ב-`scripts/supabase/backups/` — אם משהו יישבר באמצע הדמו, תוכל לשחזר ב-30 שניות.

### 7. בדיקה מקומית (10 דק' לפני הפגישה)

- [ ] `npm run build && npm run start` — ודא שאין שגיאות
- [ ] פתח `http://localhost:3000/login`
- [ ] התחבר עם `ADVISOR_EMAIL` + הסיסמה
- [ ] ודא שאתה רואה את ה-CRM עם "משפחה לדוגמה"
- [ ] היכנס ל-impersonate והסתובב בדשבורד, נדל"ן, תקציב
- [ ] הריץ את סימולטור רכישת נכס (דירה יחידה 2M → אמור להראות מס רכישה של ~₪743, לא 160K)
- [ ] בצע logout — ודא שלא נשאר session תלוי

### 8. פתח טאבים בדפדפן מראש

- [ ] `localhost:3000/login`
- [ ] Supabase dashboard של `plan-client-001` — למקרה שצריך להראות RLS בזמן אמת
- [ ] Google Meet / Zoom

---

## 🧯 פלאן B — אם משהו נשבר בזמן הדמו

| תסריט | פעולה |
|---|---|
| הלקוח רואה שגיאה / דאטה מוזר | `./scripts/supabase/restore.sh backups/baseline-client-001-*.sql.gz` |
| `npm run start` נופל | גבה ל-`.env.local.dev.backup` ו-`npm run dev` |
| Auth תקוע | מ-dashboard של Supabase → Auth → Users → reset password |

---

## ✅ Pre-flight checklist (בוקר יום רביעי)

- [ ] `git status` נקי
- [ ] `npm run build` ירוק
- [ ] `.env.local` מצביע על `client-001`, לא על פרויקט הפיתוח
- [ ] Snapshot קיים ב-`scripts/supabase/backups/`
- [ ] סוללת הלפטופ > 50% / מחובר לחשמל
- [ ] WiFi יציב — אם לא, חיבור אתרנט
- [ ] סגור טאבים רגישים בדפדפן (Gmail אישי, וכו')
- [ ] מיקרופון ומצלמה נבדקים

---

## 🔐 אחרי הדמו

- [ ] אם הלקוח ממשיך: השאר את הפרויקט, סובב סיסמאות
- [ ] אם לא: אפשר להקפיא את הפרויקט ב-Supabase (free tier) או למחוק
- [ ] החזר לפיתוח: `cp .env.local.dev.backup .env.local`

---

## 📌 מה בדוק ו-GREEN נכון לעכשיו

- ✅ אימות API — middleware חוסם `/api/*` לא-מחוברים + `requireUser()` על 4 הנתיבים ההיסטוריים
- ✅ Impersonation — cookie לא חתום אבל ה-layout מאמת `advisor_id = auth.uid()` בכל render
- ✅ מס רכישה — דירה יחידה מחשב נכון לפי מדרגות 2026 (פטור עד 1.98M, 3.5% עד 2.35M, וכו')
- ✅ מס שבח — מחושב על רווח ריאלי (צמוד למדד), לא נומינלי
- ✅ ביטוח לאומי + בריאות — רייטס 2026 (0.4%/7% + 3.1%/5%), מבוסס על `AVG_WAGE_2026 = 13,350`
- ✅ TypeScript + build — ירוק, 14 API routes + 15 pages

## ⚠️ פערים ידועים (non-blocking לדמו)

- QA: 0 בדיקות Playwright — לא חוסם דמו חי
- Impersonation HMAC — חתימה לא מוטמעת (הגנה קיימת ב-layout DB check)
