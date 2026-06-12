/**
 * report-error — נקודת דיווח שגיאות אחת לכל הקוד.
 *
 * רקע: בעבר היו בפרויקט מאות בלוקי `catch {}` ריקים. כל שגיאה — parse
 * פגום, חריגת מכסת אחסון, כשל רשת, באג אמיתי — נבלעה בשקט. כשמשהו נשבר
 * אצל לקוח בפרודקשן, אף אחד לא ידע, גם לא Sentry שכבר מחובר.
 *
 * הפתרון: כל catch קורא ל-reportError(scope, e). זה אף פעם לא זורק
 * בחזרה (כדי לא להחליף שגיאה אחת באחרת), תמיד כותב ל-console, ומדווח
 * ל-Sentry עם tag של המודול. captureException הוא no-op כש-Sentry לא
 * אותחל (אין DSN ב-dev), אז אין צורך בבדיקות נוספות.
 */

import * as Sentry from "@sentry/nextjs";

export function reportError(scope: string, e: unknown): void {
  try {
    // eslint-disable-next-line no-console
    console.warn(`[${scope}]`, e);
  } catch {
    /* console לא זמין — אין מה לעשות */
  }
  try {
    Sentry.captureException(e, { tags: { scope } });
  } catch {
    /* דיווח לא יכול להפיל את הזרימה */
  }
}
