# סשן 2026-06-13 — מערכת ניהול מנויים (Subscriptions) דו-שכבתית

## הרקע / הבעיה

עד הסשן הזה, כשמשתמש סימן חיוב כ"לא subscription" במסך Discover, ההחלטה נשמרה
**רק ב-localStorage של הדפדפן** (עם עותק Blob). שלוש בעיות:

1. **אין ביטול / נראות** — אם לחצו בטעות, אין מסך לראות או לבטל מה שסומן.
2. **אין למידה** — כל לקוח מתחיל מאפס; המערכת לא מנצלת מידע מצטבר מלקוחות אחרים.
3. **אין שליטה מרכזית** — לאדמין אין דרך לנהל אילו בתי עסק נחשבים מנוי במערכת כולה.

## המודל החדש — שתי שכבות

| שכבה | טבלה | מי שולט | תפקיד |
|------|------|---------|--------|
| 1. החלטת לקוח | `subscription_overrides` | הלקוח (per-household) | "אצלי X הוא / אינו מנוי" |
| 2. קטלוג מערכת | `subscription_merchants` | יועצים (advisors) | ברירת מחדל נלמדת לכל הלקוחות |

**סדר הכרעה:** החלטת לקוח ← גובר על → קטלוג מערכת ← גובר על → זיהוי אוטומטי (recurring radar).
החלטת הלקוח **תמיד** מנצחת (החלטת מוצר מפורשת).

**נרמול שזוכר שמות:** כל רשומה שומרת `normalized_key` (מפתח ההתאמה) +
מערך `aliases` עם כל השמות המקוריים שראינו. שמות חדשים שממופים למפתח קיים
מצטרפים אוטומטית. בנוי מעל `normalizeSupplier` הקיים.

## מיגרציות (הורצו ל-production דרך `supabase db push`)

1. **`20260613110000_subscriptions.sql`**
   - טבלה `subscription_overrides` (household_id, normalized_key, aliases, decision, label, updated_by, updated_at) + RLS: יועץ ניגש רק למשקי הבית שלו (כמו `client_state`).
   - טבלה `subscription_merchants` (normalized_key unique, aliases, is_subscription, label, learn_count) + RLS: קריאה לכל מאומת, כתיבה ליועצים בלבד.
   - טריגרים ל-`updated_at`.
   - פונקציית `subscription_learning_suggestions()` — `SECURITY DEFINER`, מחזירה אגרגציה ללא PII (מפתח + label לדוגמה + ספירת לקוחות + האם בקטלוג). מאפשרת ליועץ לראות "כמה לקוחות במערכת סימנו X כמנוי" בלי לחשוף מי.

2. **`20260613113000_subscription_overrides_applies_to_past.sql`**
   - עמודה `applies_to_past boolean default true` — האם ההחלטה חלה גם על עסקאות שקדמו לתאריך הסימון.

## קוד שנוסף

### שכבת לוגיקה (`lib/subscriptions/`)
- **`normalize.ts`** — `subscriptionKey(desc)` בונה מפתח יציב; `mergeAlias()` זוכר שמות.
- **`types.ts`** — `SubscriptionOverride`, `CatalogMerchant`, `LearningSuggestion`.
- **`overrides-store.ts`** — שכבת לקוח: localStorage-first + סנכרון רקע ל-DB (`hydrateOverridesFromRemote`, `setSubscriptionOverride`, `clearSubscriptionOverride`).
- **`catalog-store.ts`** — קטלוג מערכת: cache גלובלי + `hydrateCatalogFromRemote`, `upsertCatalogMerchant`, `removeCatalogMerchant`.
- **`classify.ts`** — `classifySubscription()` (לפי בית עסק) + `classifySubscriptionForTransaction()` (מכבד `appliesToPast` מול תאריך עסקה).
- **`__tests__/classify.test.ts`** — 12 בדיקות (נרמול, aliases, סדר הכרעה, applies_to_past). הרצה: `npx tsx lib/subscriptions/__tests__/classify.test.ts`.

### עמודים (UI)
- **`app/(client)/settings/page.tsx`** — מרכז הגדרות חדש; מציג קישור "ניהול מנויים", וליועצים גם קישור לקטלוג האדמין.
- **`app/(client)/settings/subscriptions/page.tsx`** — עמוד ניהול הלקוח:
  - אזור "מה שכבר סימנתי" עם כפתור **בטל** לכל שורה.
  - אזור "כל בתי העסק שלי" (נגזר מהעסקאות) עם חיפוש + מתגי מנוי/לא-מנוי.
  - Modal אישור עם תיבת סימון "לסמן גם עסקאות עבר".
- **`app/(client)/admin/subscriptions/page.tsx`** — קטלוג מערכתי ליועצים בלבד:
  - הוספה/הסרה ידנית.
  - **הצעות שנלמדו מהשטח** (מ-`subscription_learning_suggestions`) עם כפתור "הוסף לקטלוג".

### חיבורים
- **`lib/nav.ts`** — פריט תפריט "הגדרות" (אייקון `settings`) בתחתית הצד.
- **`lib/sync/bootstrap.ts`** — הידרציה של overrides + catalog בעליית סשן / החלפת לקוח.
- **`lib/client-scope.ts`** — שני אירועי refresh חדשים נרשמו ב-`STORE_REFRESH_EVENTS`.
- **`app/(client)/budget/DiscoverTab.tsx`** — כפתור "לא subscription" כותב כעת גם ל-overrides store מגובה-DB (מעבר ל-radar exclusions הישן), כדי שיסונכרן, יופיע בהגדרות, ויזין את הלמידה.

## החלטות ארכיטקטורה

- **גישה ישירה מהדפדפן ל-Supabase עם RLS** (כמו `admin/cities` הקיים) במקום API routes ייעודיים — האבטחה נאכפת ברמת ה-DB, פחות קוד.
- **`subscriptions-radar-exclusions` הישן נשמר** לתאימות לאחור; הסימון החדש כותב לשני המקומות. אפשר בעתיד למגר ולמחוק.

## אימות
- `npx tsc --noEmit` → נקי (exit 0).
- `npm run build` → עבר; שלושת העמודים החדשים נוצרו (`/settings`, `/settings/subscriptions`, `/admin/subscriptions`).
- ESLint על הקבצים החדשים → נקי.
- בדיקות יחידה → 12/12 עברו.

## TODO עתידי (לא בוצע)
- מיגרציית נתונים חד-פעמית מ-radar exclusions הישן ל-overrides החדש, ואז מחיקת הישן.
- אימות ויזואלי (צילומי מסך) של העמודים בדפדפן.
- אפשרות "מיזוג שמות" ידני באדמין (איחוד שני מפתחות לאותו בית עסק).
