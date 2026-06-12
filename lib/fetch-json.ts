/**
 * fetch-json — fetch עם בדיקת ok, timeout, ופענוח שגיאה.
 *
 * רקע: קריאות fetch רבות בצד לקוח לא בדקו res.ok ולא הגדירו timeout.
 * תגובת 500 עם גוף שגיאה נכנסה ל-res.json() ונכשלה בהמשך עם שגיאה לא
 * קשורה; בקשה תקועה תלתה את הזרימה ללא קצה.
 *
 * FetchJsonError נושא את ה-status וה-payload כדי שה-caller יוכל להחליט.
 */

export class FetchJsonError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "FetchJsonError";
    this.status = status;
    this.payload = payload;
  }
}

export interface FetchJsonOptions extends RequestInit {
  /** timeout במילישניות (ברירת מחדל 30s). */
  timeoutMs?: number;
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchJsonOptions = {}
): Promise<T> {
  const { timeoutMs = 30_000, signal, ...rest } = opts;

  // משלבים timeout עם signal חיצוני אם נמסר.
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const finalSignal =
    signal && "any" in AbortSignal
      ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
          signal,
          timeoutSignal,
        ])
      : timeoutSignal;

  const res = await fetch(url, { ...rest, signal: finalSignal });

  // מנסים לפענח JSON תמיד — גם בשגיאה הגוף שימושי (error code).
  let payload: unknown = null;
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text; // לא-JSON (למשל HTML של שגיאת proxy)
    }
  }

  if (!res.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : res.statusText;
    throw new FetchJsonError(`${url} → ${res.status} ${detail}`, res.status, payload);
  }

  return payload as T;
}
