# Project Rules

## Git workflow

- All local work stays on `main`.
- Do not create, switch to, or merge local branches on this machine.
- Commit directly on `main` only.
- If a change needs to be published, push `main` directly to `origin/main`.

## Code quality

- **אין `catch {}` ריק.** כל catch מדווח דרך `reportError(scope, e)` (`lib/report-error.ts`).
  ESLint אוכף את זה (`no-empty`, allowEmptyCatch:false).
- **קבצי-ענק:** כל PR שנוגע בקובץ מעל ~1,500 שורות (כיום `budget/page.tsx`,
  `dashboard/page.tsx`, `debt/page.tsx`) מחלץ ממנו לפחות hook או תת-קומפוננטה
  אחת ל-`page-files/`. לא משכתבים בבת אחת — מפרקים בהדרגה תוך כדי נגיעה.
- **כתיבת localStorage:** דרך `safeSetItem` (`lib/safe-storage.ts`), לא `localStorage.setItem` ישיר.
- **קריאת JSON מאחסון:** דרך `safeParse`/`readJSON` (`lib/safe-json.ts`).
- **API routes:** ולידציית קלט דרך `parseBody` + סכימת zod (`lib/api/validate.ts`).
  route שמקבל householdId מהלקוח חייב `assertHouseholdAccess` לפני כתיבה.

