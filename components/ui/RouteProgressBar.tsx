"use client";

/**
 * RouteProgressBar — slim NProgress-style bar fixed to the top of the
 * viewport that animates during client-side route transitions.
 *
 * How it works (no deps, no router patching):
 *   • A capture-phase click listener detects clicks on internal <a> links
 *     that navigate to a DIFFERENT path → start the bar immediately.
 *   • `usePathname()` changes when the new route commits → finish the bar.
 *   • A safety timeout finishes the bar after 8s in case navigation was
 *     cancelled (e.g. same-page anchor, blocked beforeunload).
 *
 * Progress "trickles" toward 90% and only jumps to 100% on completion, so
 * slow RSC payloads still feel alive.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const stopTimers = () => {
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (safetyRef.current) clearTimeout(safetyRef.current);
    trickleRef.current = null;
    safetyRef.current = null;
  };

  const finish = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    stopTimers();
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  };

  const start = () => {
    if (activeRef.current) return;
    activeRef.current = true;
    stopTimers();
    setVisible(true);
    setProgress(12);
    trickleRef.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.08)));
    }, 180);
    safetyRef.current = setTimeout(finish, 8000);
  };

  /* Finish whenever the route actually changes */
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const current = window.location.pathname + window.location.search;
      if (url.pathname + url.search === current) return;
      start();
    };
    const onPopState = () => start();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      stopTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]"
    >
      <div
        className="h-full rounded-l-full transition-[width] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg, #059669, #34d399)",
          boxShadow: "0 0 8px rgba(16,185,129,0.55)",
          float: "right", // RTL — fill from the right edge
        }}
      />
    </div>
  );
}
