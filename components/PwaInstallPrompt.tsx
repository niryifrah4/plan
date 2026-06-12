"use client";

/**
 * PwaInstallPrompt — bottom-sheet banner that guides the user to install
 * the PWA on iOS (Safari) or Android (Chrome).
 *
 * Why: most clients don't know what "Add to Home Screen" is. Without
 * guidance they use plan as a website forever, missing the standalone
 * full-screen experience that justifies all the PWA work.
 *
 * Triggers (any of):
 *   - First arrival to /dashboard from any auth flow (one-time)
 *   - 2nd visit overall, regardless of route (one-time)
 *
 * Dismissal:
 *   - "התקנתי" → never show again on this device
 *   - "אחר כך" → snooze 7 days
 *
 * iOS = beforeinstallprompt is NOT supported in Safari. We detect iOS
 * Safari (non-standalone) and show step-by-step instructions instead.
 * Android Chrome fires beforeinstallprompt; we capture it and show a
 * native install button.
 */

import { useEffect, useState } from "react";
import { reportError } from "@/lib/report-error";

const SEEN_KEY = "plan:pwa_install_seen";
const SNOOZE_KEY = "plan:pwa_install_snoozed_until";
const VISIT_COUNT_KEY = "plan:visit_count";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type Platform = "ios-safari" | "android-chrome" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (isIos) {
    // Safari only — Chrome on iOS uses WebKit but doesn't expose "Add to Home"
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    return isSafari ? "ios-safari" : "unknown";
  }
  const isAndroid = /Android/.test(ua);
  if (isAndroid && /Chrome/.test(ua)) return "android-chrome";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses navigator.standalone; others use display-mode media query
  const iosStandalone =
    typeof (navigator as unknown as { standalone?: boolean }).standalone === "boolean" &&
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const mqStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return iosStandalone || mqStandalone;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return; // already installed — never show

    const p = detectPlatform();
    setPlatform(p);

    // Visit count
    let visits = 0;
    try {
      visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || "0", 10) || 0;
      localStorage.setItem(VISIT_COUNT_KEY, String(visits + 1));
    } catch (e) { reportError("PwaInstallPrompt", e); }

    // Dismissed permanently?
    try {
      if (localStorage.getItem(SEEN_KEY) === "1") return;
      const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      if (snoozedUntil && Date.now() < snoozedUntil) return;
    } catch (e) { reportError("PwaInstallPrompt", e); }

    // Capture Android Chrome's beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // Defer slightly so the page settles before we pop up
      setTimeout(() => setShow(true), 800);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari has no event — show on visit #2+ or 5 seconds after first
    if (p === "ios-safari") {
      const delay = visits >= 1 ? 1500 : 5000;
      const id = setTimeout(() => setShow(true), delay);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(id);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstalled = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) { reportError("PwaInstallPrompt", e); }
    setShow(false);
  };

  const handleSnooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch (e) { reportError("PwaInstallPrompt", e); }
    setShow(false);
  };

  const handleAndroidInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        handleInstalled();
      } else {
        handleSnooze();
      }
    } catch {
      handleSnooze();
    }
  };

  if (!show) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 md:pb-6"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-lg"
        style={{
          background: "var(--morning-surface, #FFFFFF)",
          border: "1px solid var(--morning-border, #e5e9dc)",
          pointerEvents: "auto",
        }}
      >
        <div className="flex items-start gap-3 p-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ color: "var(--morning-forest, #2c7a5a)" }}
            >
              add_to_home_screen
            </span>
          </div>
          <div className="flex-1">
            <div className="mb-1 text-[14px] font-extrabold text-verdant-ink">
              הוסיפו את plan למסך הבית
            </div>
            <div className="mb-3 text-[12px] text-verdant-muted">
              {platform === "ios-safari"
                ? "פתחו במסך מלא, בלי שורת כתובת — כמו אפליקציה."
                : "התקנה מהירה — אייקון על המסך, פתיחה במסך מלא."}
            </div>
            {platform === "ios-safari" && (
              <ol
                className="mb-3 list-decimal space-y-1 pr-4 text-[12px]"
                style={{ color: "var(--morning-ink, #1a1a1a)" }}
              >
                <li>
                  לחצו על כפתור{" "}
                  <span
                    className="mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded align-middle text-[11px]"
                    style={{
                      background: "var(--morning-leaf-tint, #e5e9dc)",
                      color: "var(--morning-forest, #2c7a5a)",
                    }}
                    aria-hidden
                  >
                    ↑
                  </span>{" "}
                  בתחתית הדפדפן
                </li>
                <li>גללו ובחרו "הוספה למסך הבית"</li>
                <li>שם: <strong>plan</strong> · לחצו "הוספה"</li>
              </ol>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {platform === "android-chrome" && deferred && (
                <button
                  type="button"
                  onClick={handleAndroidInstall}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-extrabold"
                  style={{ background: "var(--morning-forest, #2c7a5a)", color: "#FFFFFF" }}
                >
                  התקנה עכשיו
                </button>
              )}
              {platform === "ios-safari" && (
                <button
                  type="button"
                  onClick={handleInstalled}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-extrabold"
                  style={{ background: "var(--morning-forest, #2c7a5a)", color: "#FFFFFF" }}
                >
                  התקנתי
                </button>
              )}
              <button
                type="button"
                onClick={handleSnooze}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold"
                style={{
                  background: "transparent",
                  color: "var(--morning-muted, #6b7b5e)",
                  border: "1px solid var(--morning-border, #e5e9dc)",
                }}
              >
                אחר כך
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
