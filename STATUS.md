# סטטוס פרויקט — 4 באוגוסט 2026

## תוקן

- חוברת משפחה: 12 לשוניות, RTL, עריכה, נתוני אתר, סנכרון וייצוא XLSX לפי template.
- ייצוא XLSX שומר styles, צבעים, מיזוגים ומבנה 12 הלשוניות.
- אין cache מקומי לחוברת; הקריאה הקובעת מגיעה מהשרת.
- נוספה טעינת env נכונה ב־Vite גם עבור `NEXT_PUBLIC_*`.
- כתיבות blob עוברות דרך route מאומת ו־RPC קנוני.
- נוסף Bearer token גם לכתיבה ישירה וגם ל־retry queue.
- תוקן collision של מזהי משכנתאות בין households בלי לעקוף RLS.
- תוקן rate limit נמוך מדי ל־hydration; מסלולים יקרים עדיין מוגבלים בנפרד.
- `/api/health` מוחרג מ־rate limit.
- E2E משתמש ב־`E2E_EMAIL` ו־`E2E_PASSWORD` וטוען `.env`.
- `npm run typecheck`, `npm run security:check`, `npm run workbook:check`, build פרונט ובק עברו.
- UI ב־Command+B: כל 12 הלשוניות נפתחו.
- backend sync probe עם משתמש הבדיקה החזיר HTTP 200.

## לא סגור

- E2E מלא עדיין לא ירוק: בדפדפן הכתיבה נכנסת ל־retry queue. תיקון Bearer נוסף כעת גם ל־queue; צריך להריץ שוב לאחר טעינת Vite נקייה ולאשר refresh persistence.
- grants במסד עדיין רחבים בחלק מהטבלאות; נדרש מיפוי policy מלא וצמצום מדורג.
- יש שימושים ישנים ב־localStorage במודולים שאינם חוברת; נדרשת מיגרציה לשרת.
- `xlsx` עדיין תלות עם חולשות upstream; הייצוא של חוברת מבודד ומוגן, אך נדרש להחליף parser או לבודד אותו בשירות נפרד.
- חסרים backup/restore test, monitoring, alerting ו־rollback Production מוכחים.
- קיימות אזהרות bundle גדולות ו־dynamic imports כפולים; לא חוסם build, דורש refactor ביצועים.
- `npm run dev` לא מנהל תהליכים ישנים: אם 5173/3001 תפוסים, צריך לסגור process ישן לפני הפעלה.

## בדיקות אחרונות

- `POST /api/sync/blob` עם משתמש בדיקה: `200`, version הוחזר.
- UI: 12/12 לשוניות.
- E2E: login עבר; מסלול save עדיין בבדיקה לאחר תיקון retry queue.

## סדר המשך

1. להריץ E2E נקי ולוודא save → refresh → ערך נשמר.
2. להריץ E2E mobile.
3. למפות ולצמצם grants לפי טבלה ופעולה.
4. להשלים localStorage migration לכל המודולים.
5. להוסיף backup/restore, ניטור ו־rollback Production.
