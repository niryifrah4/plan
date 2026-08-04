# מפת בעלות נתונים — חוברת משפחה

מטרה: החוברת היא ממשק נוסף לאותו תיק לקוח. אין לה מאגר נתונים נפרד.

| תחום | מקור אמת נוכחי | חוברת קוראת | חוברת כותבת |
|---|---|---|---|
| פרטי משפחה ושאלון | onboarding snapshot + local cache | `hydrateWorkbookFromSite` | `syncWorkbookRowToSite` |
| תקציב והוצאות | budget store | `loadBudgets` | `saveBudgets` |
| חובות והלוואות | debt store | `loadDebtData` | `saveDebtData` |
| נכסים ונדל״ן | accounts / realestate stores | store loaders | מסך המקור; חוברת מציגה מחושב |
| מטרות | buckets store | `loadBuckets` | עדכון מטרה לפי שם |
| פנסיה | pension store / onboarding | hydrate עתידי | מסך המקור; אין כתיבה מהחוברת עדיין |
| תזרים חודשי | budget + assumptions + workbook cells | stores + workbook | workbook cells + mapped stores |
| עסק | business scope + workbook cells | workbook/store bridge | workbook cells; הפרדה דורשת השלמה |
| סיכום שנתי | חישובי תזרים | מנוע חישובים | לקריאה בלבד |
| תובנות | חישובי מאזן/תזרים | מנוע חישובים | לקריאה בלבד |
| יומן ליווי | journal store | store עתידי | store עתידי |
| מחשבונים | חישובי domain | מאזן/חובות/הנחות | לקריאה בלבד |

## כללי שינוי

1. UI לא מגדיר מקור אמת חדש.
2. שדה מחושב נשאר לקריאה בלבד.
3. שינוי מהחוברת עובר דרך bridge יחיד לכל תחום.
4. localStorage הוא cache; Supabase הוא שכבת persistence מרוחקת.
5. כל תחום חדש מקבל בדיקת sync לפני חיבור ללשונית.

## פערים ידועים

- hydrate onboarding יכול להתחרות בכתיבה מקומית בזמן מעבר מסכים; נדרש resolver גרסאות משותף.
- יומן, פנסיה ועסק עדיין אינם bridge מלא דו־כיווני.
- ייצוא XLSX משמר 12 לשוניות, סדר שורות, ערכים ו־RTL; עיצוב Excel מתקדם דורש writer שתומך styles.
