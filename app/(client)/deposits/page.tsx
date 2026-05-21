"use client";

/**
 * /deposits — kept only as a back-compat redirect to the unified
 * /budget page. Monthly deposit tracking now lives in the "הפקדות" tab.
 *
 * The original page is preserved alongside as _legacy_page.tsx.bak
 * until the next cleanup pass.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DepositsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/budget?tab=deposits");
  }, [router]);
  return (
    <div className="mx-auto max-w-md p-10 text-center" dir="rtl">
      <div className="mb-2 text-[12px] font-bold text-verdant-muted">מעביר לעמוד החדש…</div>
      <div className="text-[15px] font-extrabold text-verdant-ink">
        ההפקדות עברו לטאב בתוך תזרים חודשי
      </div>
    </div>
  );
}
