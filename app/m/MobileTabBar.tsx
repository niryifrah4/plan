"use client";

/**
 * Bottom navigation bar for /m/*. Four tabs, always visible. Tap to
 * switch between the home overview, the cashflow tool, goals, and
 * net worth. The active tab is highlighted with the Morning forest
 * tone. RTL — first item (בית) sits on the right edge as expected.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  icon: string;
};

const TABS: Tab[] = [
  { href: "/m", label: "בית", icon: "home" },
  { href: "/m/budget", label: "תקציב", icon: "savings" },
  { href: "/m/goals", label: "יעדים", icon: "flag" },
  { href: "/m/balance", label: "שווי", icon: "trending_up" },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/m") return pathname === "/m";
  return pathname.startsWith(href);
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט מובייל"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--morning-surface)",
        borderTop: "1px solid var(--morning-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -4px 20px rgba(16, 24, 40, 0.04)",
      }}
    >
      <ul
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
          margin: "0 auto",
          maxWidth: 480,
          padding: "6px 4px",
          listStyle: "none",
        }}
        dir="rtl"
      >
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          const color = active ? "var(--morning-forest)" : "var(--morning-muted)";
          return (
            <li key={t.href} style={{ textAlign: "center" }}>
              <Link
                href={t.href as any}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "8px 4px",
                  textDecoration: "none",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 24,
                    color,
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                    transition: "color 0.15s ease",
                  }}
                  aria-hidden
                >
                  {t.icon}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    color,
                    letterSpacing: "0.02em",
                  }}
                >
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
