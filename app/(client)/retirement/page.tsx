"use client";

/**
 * /retirement — DEPRECATED 2026-04-29 per Nir.
 *
 * The retirement workshop folded into /pension; this stub redirects so old
 * links and bookmarks keep working. Once we're confident no external links
 * point here we can remove the route entirely.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RetirementPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/pension");
  }, [router]);
  return (
    <div className="mx-auto max-w-6xl p-6 text-center text-sm text-verdant-muted">
      מעבר לעמוד פנסיה ופרישה...
    </div>
  );
}
