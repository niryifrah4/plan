/**
 * safe-json — קריאת JSON שלא מפילה דפים.
 *
 * רקע: האפליקציה שומרת המון state ב-localStorage כ-JSON. בעשרות מקומות
 * הקוד עשה `JSON.parse(raw)` ישירות מתוך render path / state initializer.
 * ערך שנשמר חצי-שבור (דפדפן שנסגר באמצע שמירה, כתיבה מקבילה) הפיל את
 * הדף כולו למסך לבן.
 *
 * safeParse מחזיר fallback במקום לזרוק, ומדווח על הכשל ל-Sentry דרך
 * reportError כך שעדיין נדע שקרה משהו.
 */

import { reportError } from "@/lib/report-error";

/**
 * מפענח JSON בבטחה. מחזיר fallback אם הקלט ריק/null/לא-תקין.
 *
 * @param raw      מחרוזת גולמית (בד"כ מ-localStorage.getItem)
 * @param fallback ערך להחזרה כשאין קלט או שהפענוח נכשל
 * @param scope    תווית לדיווח (אופציונלי) — מזהה את מקור הקריאה ב-Sentry
 */
export function safeParse<T>(
  raw: string | null | undefined,
  fallback: T,
  scope = "safeParse"
): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    reportError(scope, e);
    return fallback;
  }
}

/**
 * קריאה + פענוח מ-localStorage בצעד אחד, SSR-safe.
 * מחזיר fallback בצד שרת, על מפתח חסר, או על JSON שבור.
 */
export function readJSON<T>(key: string, fallback: T, scope?: string): T {
  if (typeof window === "undefined") return fallback;
  try {
    return safeParse(localStorage.getItem(key), fallback, scope ?? `readJSON:${key}`);
  } catch (e) {
    reportError(scope ?? `readJSON:${key}`, e);
    return fallback;
  }
}
