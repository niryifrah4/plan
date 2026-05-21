"use client";

/**
 * /equity — kept only as a back-compat redirect to the unified
 * /investments page. RSU/ESPP/options now live in the "RSU / ESPP" tab.
 *
 * The original page is preserved alongside as _legacy_page.tsx.bak
 * until the next cleanup pass.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EquityRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/investments?tab=equity");
  }, [router]);
  return (
    <div className="mx-auto max-w-md p-10 text-center" dir="rtl">
      <div className="mb-2 text-[12px] font-bold text-verdant-muted">מעביר לעמוד החדש…</div>
      <div className="text-[15px] font-extrabold text-verdant-ink">RSU/ESPP עברו לעמוד השקעות</div>
    </div>
  );
}
