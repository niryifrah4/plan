# תיעוד סשן - 2026-06-06

## הקשר

בסשן הזה טיפלנו בשלושה נושאים מרכזיים:

- `Subscriptions Radar` זיהה חיובים חוזרים שאינם באמת מנויים.
- קבצי CAL / בנק יהב שהועלו נראו כאילו נשמרו, אבל נעלמו אחרי יציאה וכניסה מחדש.
- הופיעה שגיאת React hydration בדשבורד ואזהרת PWA בקונסול.

השינויים קובצו, בוצע להם commit, והם נדחפו ל־`main`.

Commit:

`a2af36b Persist document imports and subscription exclusions`

## Subscriptions Radar

הוספנו זיכרון קבוע לסימון חיובים כ־"לא subscription".

מה השתנה:

- נוסף כפתור `לא subscription` בכל שורה של `Subscriptions Radar`.
- לחיצה על הכפתור מסירה את השורה מיד מהמסך.
- ההחלטה נשמרת ב־Supabase דרך מנגנון `client_state` הקיים.
- השמירה היא לפי household, כך שאין השפעה בין לקוחות / משפחות שונות.
- בפעמים הבאות שהמערכת מזהה חיוב חוזר דומה, הוא מסונן לפני הצגה.
- נוסף מנגנון signature יציב שמבוסס על תיאור מנורמל וסכום, כדי לזהות את אותה הוצאה גם אם יש שינוי קטן בשם או במספרי אסמכתא.
- נוספו בדיקות ליציבות ה־signature, לסינון החרגות, ולמניעת כפילויות.

קבצים מרכזיים:

- `app/(client)/budget/DiscoverTab.tsx`
- `lib/subscriptions-radar-exclusions.ts`
- `lib/subscriptions-radar-exclusions.test.ts`
- `lib/doc-parser/recurring.ts`
- `lib/sync/bootstrap.ts`

## שמירת קבצי בנק ו־CAL

חקרנו למה קבצים שהועלו ונשמרו נעלמים אחרי יציאה וכניסה מחדש.

שורש הבעיה:

מסך אישור המסמכים שמר עסקאות מפוענחות ישירות ל־`localStorage`. הוא עקף את מסלול השמירה המרכזי של `budget-import`, שאחראי גם לדחוף את `parsed_transactions` ל־Supabase. לכן אחרי login מחדש או טעינת household מחדש, המערכת משכה נתונים מה־DB ושם העסקאות לא היו קיימות.

מה השתנה:

- נוספו `saveParsedTransactions()` ו־`saveParsedTransactionsAndWait()` ב־`lib/budget-import.ts`.
- `DocumentsTab` שומר עכשיו עסקאות מאושרות דרך המסלול המרכזי שמגובה ב־Supabase.
- בעת אישור מסמך, ה־UI מחכה שהשמירה ל־DB תסתיים לפני שהוא מציג מצב שמור.
- אם השמירה ל־DB נכשלת, המשתמש מקבל שגיאה במקום מצב מטעה של "נשמר".
- `UnmappedQueueTab` עודכן להשתמש באותו מסלול שמירה מרכזי.
- היסטוריית מסמכים (`doc_history`) קיבלה שמירה ל־Supabase במקום להיות רק מקומית.
- bootstrap של האפליקציה מושך גם את היסטוריית המסמכים מה־DB.

קבצים מרכזיים:

- `app/(client)/balance/DocumentsTab.tsx`
- `app/(client)/balance/UnmappedQueueTab.tsx`
- `lib/budget-import.ts`
- `lib/documents-store.ts`
- `lib/sync/bootstrap.ts`

## שגיאת Hydration בדשבורד

נבדק לוג הקונסול שהועלה, שבו הופיעה שגיאה:

```txt
Hydration failed because the initial UI does not match what was rendered on the server
Expected server HTML to contain a matching <div>
```

שורש הבעיה:

`DashboardPage` חישב את `hasOnboardingFields` מתוך `localStorage` בזמן render. בצד שרת הערך תמיד היה false, אבל בדפדפן כבר היה אפשר לקרוא נתונים אמיתיים ולייצר עץ UI שונה מהרינדור הראשוני של השרת.

מה השתנה:

- החישוב עבר ל־state בצד לקוח שמאותחל דרך `useEffect`.
- הרינדור הראשון בדפדפן תואם עכשיו לרינדור השרת, ורק אחרי hydration מתבצע עדכון לפי הנתונים המקומיים.

קובץ מרכזי:

- `app/(client)/dashboard/page.tsx`

## אזהרת PWA

נבדקה אזהרת הקונסול:

```txt
<meta name="apple-mobile-web-app-capable" content="yes"> is deprecated.
Please include <meta name="mobile-web-app-capable" content="yes">
```

מה השתנה:

- נוסף metadata של `mobile-web-app-capable: yes` ב־Next metadata.

קובץ מרכזי:

- `app/layout.tsx`

## בדיקות שבוצעו

פקודות שעברו בהצלחה:

```sh
npm run typecheck
npx --yes tsx lib/subscriptions-radar-exclusions.test.ts
git diff --check
```

הערות לגבי בדיקת דפדפן:

- ניסיון לפתוח את `/budget` הוביל למסך login כי לא היה session פעיל.
- ניסיון נוסף דרך Playwright נכשל כי target של הדפדפן נסגר.
- לכן האימות בפועל התבסס על typecheck, בדיקות לוגיקה, ובדיקת diff, ולא על session מלא בדפדפן מחובר.

## Git

בוצעו הפעולות הבאות:

- `git add`
- `git commit`
- `git push` ל־`origin/main`

Commit:

`a2af36b Persist document imports and subscription exclusions`

תוצאת push:

`main -> main`

## הערות שימושיות להמשך

- קבצים שהועלו לפני התיקון עלולים להצריך העלאה מחדש אם הם מעולם לא נשמרו בפועל ל־Supabase.
- אחרי התיקון, קבצים מאושרים אמורים להישאר גם אחרי logout/login וגם אחרי מעבר מכשיר.
- החרגות של `Subscriptions Radar` נשמרות לפי household ולא גלובלית.
- אם בעתיד צריך לתקן סימון שגוי של `לא subscription`, אפשר להוסיף מסך ניהול קטן מעל אותה תשתית קיימת.
