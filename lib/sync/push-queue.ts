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

import { reportError } from "@/lib/report-error";
import { safeParse } from "@/lib/safe-json";

export const SYNC_PENDING_EVENT = "verdant:sync:pending-changed";
const QUEUE_LS_KEY = "verdant:push_queue";
const VERSION_PREFIX = "verdant:__ver:";
const BROADCAST_NAME = "verdant-sync";
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [2_000, 8_000, 30_000, 30_000, 30_000];

interface QueueItem {
  key: string;
  value: unknown;
  householdId: string;
  attempts: number;
}

// ── גרסאות אופטימיות ──────────────────────────────────────────────
// שומרים לכל (household,key) את הגרסה האחרונה שהשרת אישר, כדי לשלוח
// expectedVersion בכתיבה הבאה ולזהות קונפליקט (טאב/מכשיר אחר שמר בינתיים).
function versionKey(householdId: string, key: string): string {
  return `${VERSION_PREFIX}${householdId}::${key}`;
}

function getLocalVersion(householdId: string, key: string): number | undefined {
  try {
    const raw = localStorage.getItem(versionKey(householdId, key));
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function setLocalVersion(householdId: string, key: string, version: number): void {
  try {
    localStorage.setItem(versionKey(householdId, key), String(version));
  } catch (e) {
    reportError("push-queue:setVersion", e);
  }
}

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(BROADCAST_NAME);
    channel.onmessage = (ev) => {
      // טאב אחר שמר — מרעננים את ה-stores המקומיים (לא משדרים בחזרה).
      if (ev.data?.type === "saved") {
        import("@/lib/client-scope")
          .then((m) => m.dispatchStoreRefreshEvents())
          .catch((e) => reportError("push-queue:bc-refresh", e));
      }
    };
  }
  return channel;
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
  if (typeof window === "undefined") return 0;
  hydrate();
  return queue.size;
}

/** Returns the pending value for a key, if any, to prevent hydration races. */
export function getPendingPush(householdId: string, key: string): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  hydrate();
  return queue.get(itemId(householdId, key))?.value;
}

/** Removes a pending push from the queue. Used when a synchronous pushBlob succeeds. */
export function dequeuePush(householdId: string, key: string): void {
  if (typeof window === "undefined") return;
  hydrate();
  queue.delete(itemId(householdId, key));
  persist();
  emitPending();
}

/** Returns all pending values for a given prefix, to merge with DB results. */
export function getPendingPushesByPrefix(householdId: string, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof window === "undefined") return out;
  hydrate();
  for (const item of queue.values()) {
    if (item.householdId === householdId && item.key.startsWith(prefix)) {
      out[item.key] = item.value;
    }
  }
  return out;
}

function scheduleFlush(delay = 0): void {
  if (typeof window === "undefined") return;
  if (flushTimer) return; // כבר מתוזמן
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, delay);
}

type PushOutcome = "ok" | "conflict" | "retry";

async function pushOne(item: QueueItem): Promise<PushOutcome> {
  const expected = getLocalVersion(item.householdId, item.key);
  let res: Response;
  try {
    res = await fetch("/api/sync/blob", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: item.key,
        value: item.value ?? null,
        householdId: item.householdId,
        ...(expected != null ? { expectedVersion: expected } : {}),
      }),
    });
  } catch (e) {
    reportError("push-queue:fetch", e);
    return "retry";
  }

  if (res.ok) {
    const body = await res.json().catch(() => null);
    if (body?.version != null) setLocalVersion(item.householdId, item.key, body.version);
    getChannel()?.postMessage({ type: "saved", key: item.key });
    return "ok";
  }

  if (res.status === 409) {
    // קונפליקט: טאב/מכשיר אחר שמר גרסה חדשה יותר. השרת מנצח —
    // מאמצים את גרסת השרת, מושכים נתונים טריים, ומתריעים למשתמש.
    const body = await res.json().catch(() => null);
    if (body?.serverVersion != null) {
      setLocalVersion(item.householdId, item.key, body.serverVersion);
    }
    notifyConflict();
    void import("./bootstrap")
      .then((m) => m.refreshAllFromRemote("push-queue:conflict", item.householdId))
      .catch((e) => reportError("push-queue:conflict-refresh", e));
    return "conflict";
  }

  // 4xx/5xx אחר — ננסה שוב.
  return "retry";
}

async function flush(): Promise<void> {
  if (queue.size === 0) return;
  // snapshot כדי לא להסתבך עם שינויים תוך כדי איטרציה
  const items = Array.from(queue.entries());
  let anyDeferred = false;

  for (const [id, item] of items) {
    let outcome: PushOutcome = "retry";
    try {
      outcome = await pushOne(item);
    } catch (e) {
      reportError("push-queue:flush", e);
      outcome = "retry";
    }

    // ok או conflict — שניהם "טופלו", הפריט יוצא מהתור (בקונפליקט השרת ניצח).
    if (outcome === "ok" || outcome === "conflict") {
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

function notifyConflict(): void {
  if (typeof window === "undefined") return;
  import("react-hot-toast")
    .then((m) =>
      m.default("הנתונים עודכנו ממקור אחר — טוען מחדש את הגרסה העדכנית.", {
        id: "sync-conflict",
        icon: "🔄",
      })
    )
    .catch((e) => reportError("push-queue:toast", e));
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
      const expected = getLocalVersion(item.householdId, item.key);
      void fetch("/api/sync/blob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: item.key,
          value: item.value ?? null,
          householdId: item.householdId,
          ...(expected != null ? { expectedVersion: expected } : {}),
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
  getChannel(); // מפעיל את המאזין לשמירות מטאבים אחרים
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
