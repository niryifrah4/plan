# סשן 2026-06-13 (המשך) — "עסקים מוסתרים" דו-שכבתי + תיקון מיקום קטלוג היועץ

המשך ישיר ל-[SESSION-2026-06-13-subscriptions.md](SESSION-2026-06-13-subscriptions.md).
שני נושאים: (א) תיקון מיקום + אייקון של קטלוג המנויים שבנינו קודם; (ב) הטמעת
מערכת "עסקים מוסתרים" דו-שכבתית על אותו עיקרון של המנויים.

---

## חלק א׳ — תיקון קטלוג המנויים (היועץ)

**מה היה לא בסדר:**
1. קטלוג המנויים ליועץ הופיע **בתוך תיק הלקוח** (`app/(client)/admin/subscriptions`)
   ובקישור בעמוד ההגדרות של הלקוח. הכוונה הייתה שיהיה ב-`/crm/settings` (אזור
   היועץ), לא בתוך תיק לקוח.
2. האייקון בכרטיס הוצג כטקסט גולמי `admin_panel_settings` — כי השתמשתי במחלקה
   `material-symbols-rounded` שלא נטענת בפרויקט. המחלקה הנכונה היא
   `material-symbols-outlined`.

**מה תוקן:**
- העמוד הועבר ל-`app/crm/settings/subscriptions/page.tsx` (האדמין מאובטח כבר
  ע״י ה-layout של `/crm`, שמוודא שהמשתמש advisor).
- נמחק `app/(client)/admin/subscriptions/`.
- מעמוד ההגדרות של הלקוח (`app/(client)/settings/page.tsx`) הוסר הקישור-אדמין;
  נשארו רק פיצ׳רים של הלקוח. כל מחלקות האייקונים תוקנו ל-`material-symbols-outlined`.
- ב-`app/crm/settings/page.tsx` נוספו שני כרטיסים עם אייקונים תקינים:
  **"קטלוג מנויים"** (`subscriptions`) ו-**"קטלוג עסקים מוסתרים"** (`visibility_off`).

---

## חלק ב׳ — "עסקים מוסתרים" (Hidden merchants)

### הרקע / הבעיה
הכפתור "עסקים מוסתרים (N)" יושב בתור-המיפוי (`balance → UnmappedQueueTab`).
משתמש מסתיר בית עסק (העברות Bit, החזרי הלוואה, העברות פנימיות) כדי שלא יטריד
בתור ולא יזהם את התזרים. העסקאות נשמרות, רק מוסתרות מהתצוגה.

הבעיה הייתה זהה למנויים לפני הסשן הקודם: **localStorage בלבד**, עם שתי רשימות
מקבילות (`excluded-merchants` ו-`excluded-merchant-keys`), בלי דאטהבייס, בלי
למידה, ובלי שליטה ליועץ.

### המודל החדש — שתי שכבות (כמו המנויים)

| שכבה | טבלה | מי שולט | תפקיד |
|------|------|---------|--------|
| 1. החלטת לקוח | `hidden_merchant_overrides` | הלקוח (per-household) | "אצלי בית עסק X מוסתר / גלוי" |
| 2. קטלוג מערכת | `hidden_merchants_catalog` | יועצים | ברירת מחדל-הסתרה נלמדת לכולם |

**סדר הכרעה:** החלטת לקוח ← קטלוג מערכת ← ברירת מחדל (גלוי). הלקוח **תמיד** גובר —
החלטת "גלוי" של לקוח מבטלת גם הסתרה מהקטלוג.

### מיגרציה (הורצה ל-production)
**`20260613120000_hidden_merchants.sql`**
- `hidden_merchant_overrides` (decision: hidden/visible) + RLS per-household.
- `hidden_merchants_catalog` (is_hidden) + RLS: קריאה לכל מאומת, כתיבה ליועצים.
- טריגרים ל-`updated_at` (משתמשים בפונקציה המשותפת `tg_subscriptions_touch`).
- `hidden_merchant_learning_suggestions()` — אגרגציה ללא PII ליועצים.

### קוד שנוסף (`lib/hidden-merchants/`)
- **`normalize.ts`** — `hiddenMerchantKey()` **תואם בייט-לבייט** לטרנספורם של תור
  המיפוי ושל `excluded-merchants` הישן (ללא חיתוך מספרי-סניף), כך שהחלטה בכל מקום
  מתאימה לאותן עסקאות. `mergeAlias()` זוכר שמות.
- **`types.ts`**, **`overrides-store.ts`** (DB-backed, LS-first),
  **`catalog-store.ts`**, **`classify.ts`**.
- `classify.ts` כולל `buildEffectiveHiddenSet(lookup, extraKeys)` — ממזג שלושה
  מקורות: הרשימה הישנה (legacy), הקטלוג, וההחלטות החדשות; החלטת "גלוי" מסירה מפתח
  גם אם legacy/קטלוג מסתירים אותו.

### עמודים (UI)
- **לקוח:** `app/(client)/settings/hidden-merchants/page.tsx` — "מה שסימנתי" (עם
  ביטול) + "כל בתי העסק שלי" (חיפוש + מתגי הסתר/הצג). קישור נוסף בעמוד ההגדרות.
- **יועץ:** `app/crm/settings/hidden-merchants/page.tsx` — ניהול קטלוג + הצעות
  שנלמדו מהשטח (מ-`hidden_merchant_learning_suggestions`).

### חיבורים
- **`UnmappedQueueTab.tsx`** — נקודת האינטגרציה:
  - חישוב `excludedSet` עכשיו דרך `buildEffectiveHiddenSet` (legacy ∪ קטלוג ∪
    overrides חדשים, פחות "גלוי").
  - פעולות הסתר/ביטול כותבות גם לרשימה הישנה (תאימות ל-modal הקיים) וגם לחנות
    החדשה מגובת-ה-DB (סנכרון + עמוד הגדרות + למידה).
  - מאזין לאירועי `HIDDEN_OVERRIDES_EVENT` / `HIDDEN_CATALOG_EVENT`.
- **`lib/sync/bootstrap.ts`** — הידרציה של overrides + catalog בעלייה/החלפת לקוח.
- **`lib/client-scope.ts`** — שני אירועי refresh חדשים ב-`STORE_REFRESH_EVENTS`.

### החלטות ארכיטקטורה
- **לא מיזגתי את שתי הרשימות הישנות** (`excluded-merchants` ו-`excluded-merchant-keys`).
  הן בשני מרחבי-מפתח שונים (האחרון משתמש בחילוץ נמען-Bit), ומיזוג מלא היה מסכן
  רגרסיה. במקום זאת השכבה החדשה מגובת-ה-DB **מצטרפת** למקורות הקיימים דרך
  `buildEffectiveHiddenSet`, והפעולות כותבות כפול. שאלת "עסקאות עבר" לא נדרשה כאן
  (הסינון ממילא חל על כל עסקאות בית העסק).

## אימות
- `npx tsc --noEmit` → נקי (exit 0).
- `npm run build` → עבר; כל המסלולים נוצרו: `/settings`, `/settings/subscriptions`,
  `/settings/hidden-merchants`, `/crm/settings/subscriptions`,
  `/crm/settings/hidden-merchants`.
- ESLint → נקי. בדיקות יחידה → 12/12 (hidden) + 12/12 (subscriptions, ללא רגרסיה).

## TODO עתידי
- מיגרציה חד-פעמית של הרשימה הישנה ל-overrides החדשים (כרגע נשען על כתיבה-כפולה
  קדימה + מיזוג ב-runtime).
- טיפול בקצה "ביטול הסתרה מ-modal" מול בית עסק שמוסתר ע״י קטלוג (כרגע clear לפי
  מפתח; ל-override "גלוי" מלא נדרש label).
- אפשרות "מיזוג שמות" ידני באדמין.
