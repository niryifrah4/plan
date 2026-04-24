/**
 * ═══════════════════════════════════════════════════════════
 *  Session Security — idle timeout + activity tracking
 * ═══════════════════════════════════════════════════════════
 *
 * מנגנון לוגאאוט אוטומטי אחרי חוסר פעילות (ברירת מחדל 15 דקות).
 * מאזין ל-mouse/keyboard/touch events ומעדכן timestamp.
 * מציג אזהרה 1 דקה לפני לוגאאוט.
 */

import { signOut } from "@/lib/auth";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_MS = 60 * 1000;    // 1 minute warning
const ACTIVITY_KEY = "verdant:last_activity";
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"];

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;
let warningShown = false;
let onWarning: (() => void) | null = null;

/** Update last activity timestamp */
function touchActivity() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {}
  resetTimers();
}

/** Reset idle/warning timers */
function resetTimers() {
  if (idleTimer) clearTimeout(idleTimer);
  if (warningTimer) clearTimeout(warningTimer);
  warningShown = false;

  warningTimer = setTimeout(() => {
    warningShown = true;
    if (onWarning) onWarning();
  }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

  idleTimer = setTimeout(() => {
    signOut(); // redirects to /login
  }, IDLE_TIMEOUT_MS);
}

/** Start the idle watcher */
export function startSessionWatcher(onWarningCallback?: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  onWarning = onWarningCallback || null;

  // Initial timestamp
  touchActivity();

  // Attach activity listeners
  const handler = () => touchActivity();
  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, handler, { passive: true });
  }

  // Cross-tab sync: if another tab resets activity, we should too
  const storageHandler = (e: StorageEvent) => {
    if (e.key === ACTIVITY_KEY) resetTimers();
  };
  window.addEventListener("storage", storageHandler);

  return () => {
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, handler);
    }
    window.removeEventListener("storage", storageHandler);
    if (idleTimer) clearTimeout(idleTimer);
    if (warningTimer) clearTimeout(warningTimer);
  };
}

/** Check if session is still valid based on last activity */
export function isSessionActive(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const last = parseInt(localStorage.getItem(ACTIVITY_KEY) || "0", 10);
    if (!last) return true;
    return Date.now() - last < IDLE_TIMEOUT_MS;
  } catch {
    return true;
  }
}

/** Time remaining before auto-logout (ms) */
export function getSessionTimeRemaining(): number {
  if (typeof window === "undefined") return IDLE_TIMEOUT_MS;
  try {
    const last = parseInt(localStorage.getItem(ACTIVITY_KEY) || "0", 10);
    if (!last) return IDLE_TIMEOUT_MS;
    return Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - last));
  } catch {
    return IDLE_TIMEOUT_MS;
  }
}

/** Extend the session (user dismissed warning) */
export function extendSession(): void {
  touchActivity();
}
