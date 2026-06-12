# סיכום סשן 2026-06-12 — תיקון סנכרון יועץ-לקוח וטעינת תיק נכון

## רקע

נבדקה בעיה שבה היועץ נכנס לתיקי לקוחות שונים, אבל בפועל ראה את אותם נתונים בכל תיק.

הדוגמה שחזרה בבדיקה:

- יפרח ב-DB: קובץ `a593e34c-308a-437e-925c-179cd38e09d5.pdf`, עם 72 תנועות.
- קרקסון ב-DB: הקבצים `2022-07.xlsx` ו-`2022-08.xlsx`, עם 50 תנועות.
- בסר ב-DB: ללא `doc_history` וללא `parsed_transactions`.
- בדפדפן לפני התיקון: גם קרקסון וגם בסר הציגו את הנתונים של יפרח.

המסקנה: הנתונים ב-Supabase לא היו מעורבבים. הבעיה הייתה בצד הדפדפן/Bootstrap של היועץ.

## מה תוקן

### 1. סנכרון קבצים בין לקוח ליועץ

תוקנה זרימת `/files` כך שהיועץ והלקוח עובדים מול אותו `household_id` ואותה תמונת נתונים.

השינויים המרכזיים:

- עמוד הקבצים מאזין לאירועי עדכון ומרענן את היסטוריית הקבצים והתנועות.
- לפני שמירת תנועות חדשות, המערכת מושכת את המידע העדכני מהשרת, ממזגת, מסירה כפילויות, ואז שומרת.
- לפני שמירת היסטוריית קבצים, המערכת מושכת את היסטוריית הקבצים העדכנית מהשרת וממזגת לפי מזהה מסמך.
- `hydrateDocHistoryFromRemote()` מפיץ אירועי רענון כך שגם מסכים שכבר פתוחים יקראו מחדש את המידע.

קבצים עיקריים:

- `app/(client)/balance/DocumentsTab.tsx`
- `lib/budget-import.ts`
- `lib/documents-store.ts`

### 2. תיקון כניסת יועץ לתיק לקוח

נמצא שורש הבעיה העיקרי:

כאשר היועץ נכנס לתיק לקוח, השרת קבע נכון את ה-cookie של `plan_impersonate_hh`, והבאנר הציג את שם הלקוח הנכון. אבל מיד לאחר מכן Bootstrap רגיל קרא ל-`resolveActiveHousehold()`, ועבור יועץ הפונקציה הזו בחרה את ה-household הראשון של היועץ. במקרה הזה זה היה יפרח.

לכן התקבל מצב מטעה:

- הבאנר: קרקסון / בסר.
- הנתונים: יפרח.

התיקון:

- Bootstrap הפך להיות מודע ל-impersonation.
- כאשר יש `impersonation.householdId`, זה ה-household הנעול.
- `prepareSessionScopeOnce()`, `refreshAllFromRemote()` ו-`bootstrapSessionOnce()` מקבלים household נעול ולא קוראים ל-`resolveActiveHousehold()` במצב הזה.
- נשמר סימון `verdant:bootstrap_household_id` כדי ש-Bootstrap לא יחשוב ש-session קודם תקף עבור household אחר.
- `watchBootstrapAuthState()` מקבל גם הוא את ה-household הנעול, כדי שאירוע auth לא יחזיר את היועץ לתיק הראשון שלו.
- ב-`ClientLayoutInner` נוספה בדיקת guard: אם אחרי Bootstrap ה-household הפעיל לא תואם ללקוח שהיועץ נכנס אליו, מנקים cache מקומי ומריצים Bootstrap מחדש עם ה-household הנכון.

קבצים עיקריים:

- `lib/sync/bootstrap.ts`
- `app/(client)/ClientLayoutInner.tsx`

### 3. בדיקת Regression

נוספה בדיקה שמוודאת לא רק שהבאנר מתחלף, אלא שהנתונים עצמם מתחלפים לפי הלקוח.

הבדיקה עוברת באותו session של היועץ בין:

- קרקסון: מצפה ל-50 תנועות.
- בסר: מצפה ל-0 תנועות.
- יפרח: מצפה ל-72 תנועות.

קובץ:

- `e2e/07-tenant-isolation-guard.spec.ts`

## אימות שבוצע

בדיקות שעברו:

```bash
npm run typecheck -- --pretty false
```

```bash
PW_BASE_URL=http://localhost:3000 PW_ADVISOR_PASSWORD=112233 npx playwright test e2e/07-tenant-isolation-guard.spec.ts --grep 'advisor client switch' --project=desktop
```

בדיקה ידנית בדפדפן הפתוח:

- קרקסון הציג 2 קבצים ו-50 תנועות, כולל `2022-08.xlsx`.
- בסר לא הציג את נתוני יפרח.
- יפרח הציג 1 קובץ ו-72 תנועות, כולל `a593e34c-308a-437e-925c-179cd38e09d5.pdf`.

## שינויים נוספים שנכללו ב-commit

ב-worktree היו גם שינויים קיימים נוספים, והמשימה הייתה לבצע `git add commit push` להכל.

השינויים הנוספים שנכללו:

- `app/(client)/balance/WealthTab.tsx`
- `app/(client)/budget/DailyCashflowTab.tsx`
- `components/balance/EditAllocationModal.tsx`
- `next-env.d.ts`

לא בוצעה הפרדה ל-commit נפרד כי ההנחיה הייתה להעלות הכל ל-`main`.

## מצב אחרי התיקון

יועץ שנכנס לתיק לקוח אמור לראות בדיוק את נתוני אותו לקוח, אחד לאחד כמו שהלקוח רואה ומזין.

אין יותר מצב שבו שם הלקוח נכון אבל הנתונים שייכים ללקוח אחר.
