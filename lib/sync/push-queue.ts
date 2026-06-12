/**
 * push-queue — תור שמירות אמין מול השרת.
 *
 * רקע (הבעיה): pushBlobInBackground היה fire-and-forget — כתב ל-localStorage
 * ודחף ל-Supabase ברקע בלי retry ובלי חיווי. אם הדחיפה נכשלה (רשת, session
 * פג), הנתון נשאר רק בדפדפן הנוכחי. המשתמש בטוח ששמר; ממכשיר אחר הנתון לא שם.
 *
 * הפתרון:
 *  1. כל שמירה נכנסת לתור. כתיבה חדשה לאותו (household,key) דורסת ישנה
 *     שעוד לא נשלחה — חוסך בקשות מיותרות.
 *  2. retry עם backoff (2s → 8s → 30s, עד 5 ניסיונות) + טריגר על חזרת רשת.
 *  3. התור נשמר ב-localStorage כך ששמירה שלא הספיקה לעלות שורדת reload.
 *  4. flush אחרון ב-pagehide עם fetch keepalive ל-route, כדי לתפוס שינויים
 *     רגע לפני סגירת הטאב.
 *  5. getPendingCount() + אירוע verdant:sync:pending-changed להזנת חיווי UI.
 */

import { pushBlob } from "./blob-sync";
import { reportError } from "@/lib/report-error";
import { safeParse } from "@/lib/safe-json";

export const SYNC_PENDING_EVENT = "verdant:sync:pending-changed";
const QUEUE_LS_KEY = "verdant:push_queue";
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [2_000, 8_000, 30_000, 30_000, 30_000];

interface QueueItem {
  key: string;
  value: unknown;
  householdId: string;
  attempts: number;
}

// המפתח הלוגי בתור: כל (household,key) ייחודי.
function itemId(householdId: string, key: string): string {
  return `${householdId}::${key}`;
}

const queue = new Map<string, QueueItem>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let hydrated = false;

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(Array.from(queue.values())));
  } catch (e) {
    // מכסת אחסון מלאה — לא קריטי, התור עדיין חי ב-memory.
    reportError("push-queue:persist", e);
  }
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const saved = safeParse<QueueItem[]>(
    localStorage.getItem(QUEUE_LS_KEY),
    [],
    "push-queue:hydrate"
  );
  for (const it of saved) {
    if (it && it.householdId && it.key) {
      queue.set(itemId(it.householdId, it.key), { ...it, attempts: 0 });
    }
  }
}

function emitPending(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(SYNC_PENDING_EVENT, { detail: queue.size }));
  } catch (e) {
    reportError("push-queue:emit", e);
  }
}

export function getPendingCount(): number {
  return queue.size;
}

function scheduleFlush(delay = 0): void {
  if (typeof window === "undefined") return;
  if (flushTimer) return; // כבר מתוזמן
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, delay);
}

async function flush(): Promise<void> {
  if (queue.size === 0) return;
  // snapshot כדי לא להסתבך עם שינויים תוך כדי איטרציה
  const items = Array.from(queue.entries());
  let anyDeferred = false;

  for (const [id, item] of items) {
    let ok = false;
    try {
      ok = await pushBlob(item.key, item.value, item.householdId);
    } catch (e) {
      reportError("push-queue:flush", e);
      ok = false;
    }

    if (ok) {
      queue.delete(id);
      emitPending();
      continue;
    }

    item.attempts += 1;
    if (item.attempts >= MAX_ATTEMPTS) {
      // כישלון סופי — לא לאבד בשקט. מדווחים ומסירים מהתור כדי לא להיתקע.
      reportError(
        "push-queue:gave-up",
        new Error(`push failed after ${MAX_ATTEMPTS} attempts: ${item.key}`)
      );
      queue.delete(id);
      emitPending();
      notifyGaveUp(item.key);
    } else {
      anyDeferred = true;
    }
  }

  persist();

  if (anyDeferred) {
    // קובעים backoff לפי הניסיון הגבוה ביותר שעדיין בתור.
    const maxAttempts = Math.max(0, ...Array.from(queue.values()).map((i) => i.attempts));
    scheduleFlush(BACKOFF_MS[Math.min(maxAttempts, BACKOFF_MS.length - 1)]);
  }
}

function notifyGaveUp(key: string): void {
  if (typeof window === "undefined") return;
  // toast רך — נטען עצלן כדי לא לכפות תלות על מודולים שאינם UI.
  import("react-hot-toast")
    .then((m) =>
      m.default.error("חלק מהשינויים לא נשמרו לשרת. בדקו את החיבור ונסו שוב.", {
        id: "sync-failed",
      })
    )
    .catch((e) => reportError("push-queue:toast", e));
}

/**
 * מוסיף שמירה לתור (או דורס ישנה לאותו key) ומפעיל flush.
 * זו נקודת הכניסה שמחליפה את pushBlobInBackground הישן.
 */
export function enqueuePush(key: string, value: unknown, householdId: string): void {
  if (typeof window === "undefined" || !householdId || !key) return;
  hydrate();
  queue.set(itemId(householdId, key), { key, value, householdId, attempts: 0 });
  persist();
  emitPending();
  ensureListeners();
  scheduleFlush(0);
}

/**
 * flush סינכרוני-ככל-הניתן לפני סגירת הטאב: שולח כל פריט ל-route עם
 * keepalive כדי שהבקשה תשרוד את ה-unload.
 */
function flushOnUnload(): void {
  if (queue.size === 0) return;
  for (const item of queue.values()) {
    try {
      void fetch("/api/sync/blob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: item.key,
          value: item.value ?? null,
          householdId: item.householdId,
        }),
        keepalive: true,
      });
    } catch (e) {
      reportError("push-queue:unload", e);
    }
  }
}

function ensureListeners(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  hydrate();
  window.addEventListener("online", () => scheduleFlush(0));
  window.addEventListener("pagehide", flushOnUnload);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnUnload();
  });
  // אם נטענו פריטים מ-reload קודם — לנסות לשלוח מיד.
  if (queue.size > 0) {
    emitPending();
    scheduleFlush(0);
  }
}

// אתחול בטעינת המודול (בצד לקוח) כדי לשלוף תור ששרד reload.
if (typeof window !== "undefined") {
  ensureListeners();
}
