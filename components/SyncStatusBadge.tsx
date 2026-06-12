"use client";

/**
 * SyncStatusBadge — חיווי "מסונכרן / ממתין" בסגנון Google Docs.
 *
 * מאזין לאירוע verdant:sync:pending-changed שתור הדחיפה (push-queue) פולט,
 * ומציג כמה שמירות עדיין ממתינות לעלות לשרת. כשהכל עלה — הבועה נעלמת אחרי
 * רגע. בנוסף מתריע ב-beforeunload אם המשתמש מנסה לסגור עם שינויים תלויים.
 */

import { useEffect, useState } from "react";
import { SYNC_PENDING_EVENT, getPendingCount } from "@/lib/sync/push-queue";

export function SyncStatusBadge() {
  const [pending, setPending] = useState(0);
  const [showSynced, setShowSynced] = useState(false);

  useEffect(() => {
    setPending(getPendingCount());

    function onChange(e: Event) {
      const next =
        (e as CustomEvent<number>).detail ?? getPendingCount();
      setPending((prev) => {
        // מעבר מ->0 ל-0: להבליח "נשמר" לרגע.
        if (prev > 0 && next === 0) {
          setShowSynced(true);
          window.setTimeout(() => setShowSynced(false), 2500);
        }
        return next;
      });
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (getPendingCount() > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }

    window.addEventListener(SYNC_PENDING_EVENT, onChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener(SYNC_PENDING_EVENT, onChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  if (pending === 0 && !showSynced) return null;

  const waiting = pending > 0;
  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[70] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold shadow-soft"
      style={{
        background: waiting ? "#FEF3C7" : "#DCFCE7",
        color: waiting ? "#92400E" : "#166534",
        border: `1px solid ${waiting ? "#FDE68A" : "#BBF7D0"}`,
      }}
    >
      <span className="material-symbols-outlined text-[15px]">
        {waiting ? "cloud_upload" : "cloud_done"}
      </span>
      {waiting ? `ממתין לסנכרון (${pending})` : "נשמר"}
    </div>
  );
}
