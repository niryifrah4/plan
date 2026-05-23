"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * /m bottom tab bar — 4 tabs, always visible. The non-built tabs
 * are kept here (greyed out) so the visual structure of the mobile
 * app is in place from day one; we wire them up as each page lands.
 */

type Tab = {
  href: string;
  label: string;
  icon: string; // Material Symbols Outlined name
  enabled: boolean;
};

const TABS: Tab[] = [
  { href: "/m", label: "בית", icon: "home", enabled: true },
  { href: "/m/budget", label: "תקציב", icon: "savings", enabled: true },
  { href: "/m/goals", label: "יעדים", icon: "flag", enabled: true },
  { href: "/m/balance", label: "שווי", icon: "trending_up", enabled: true },
];

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
        boxShadow: "0 -4px 24px rgba(16, 24, 40, 0.04)",
      }}
    >
      <ul
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
          margin: "0 auto",
          maxWidth: 480,
          padding: "8px 4px 6px",
          listStyle: "none",
        }}
        dir="rtl"
      >
        {TABS.map((t) => {
          const active =
            t.href === "/m" ? pathname === "/m" : pathname?.startsWith(t.href) ?? false;
          const color = !t.enabled
            ? "var(--morning-subtle)"
            : active
            ? "var(--morning-forest)"
            : "var(--morning-muted)";

          const inner = (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "6px 4px",
                opacity: t.enabled ? 1 : 0.55,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 24,
                  color,
                  fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                }}
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
            </div>
          );

          return (
            <li key={t.href} style={{ textAlign: "center" }}>
              {t.enabled ? (
                <Link
                  href={t.href as any}
                  style={{ display: "block", textDecoration: "none" }}
                  aria-current={active ? "page" : undefined}
                >
                  {inner}
                </Link>
              ) : (
                <div
                  aria-disabled
                  title="בקרוב"
                  style={{ cursor: "not-allowed" }}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
