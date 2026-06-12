/**
 * safe-storage — כתיבה ל-localStorage שלא נכשלת בשקט.
 *
 * רקע: ל-localStorage יש מכסה (~5MB). לקוח עם הרבה תנועות/מסמכים יכול
 * להגיע אליה, ואז setItem זורק QuotaExceededError. עד היום זה נבלע ב-catch
 * ריק — המשתמש "שמר" וכלום לא נשמר, בלי שום סימן.
 *
 * safeSetItem מבדיל בין מכסה מלאה (חמור — צריך להתריע למשתמש) לבין כשל
 * אחר, ומדווח ל-Sentry. מחזיר true/false כדי שה-caller יוכל להחליט
 * (למשל לא לסמן "נשמר" אם הכתיבה נכשלה).
 *
 * הערה: זהו צעד 8.0 מתוך מעבר ל-Supabase כמקור אמת. כשהמיגרציה תושלם,
 * localStorage יהפוך ל-cache בלבד וכישלון כתיבה כאן יהיה לא-קריטי.
 */

import { reportError } from "@/lib/report-error";

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  // שמות/קודים שונים בין דפדפנים.
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
}

let quotaToastShown = false;

export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    reportError("safe-storage:setItem", e);
    if (isQuotaError(e) && !quotaToastShown) {
      quotaToastShown = true; // פעם אחת לסשן — לא להציף
      import("react-hot-toast")
        .then((m) =>
          m.default.error(
            "האחסון המקומי מלא. חלק מהנתונים עלולים לא להישמר — מומלץ לפנות נתונים ישנים.",
            { id: "quota-exceeded", duration: 6000 }
          )
        )
        .catch(() => {});
    }
    return false;
  }
}
