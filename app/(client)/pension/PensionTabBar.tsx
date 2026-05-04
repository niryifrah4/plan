"use client";

/**
 * Shared tab bar at the top of /pension and /retirement.
 * Visually presents them as one feature with two views.
 * Each tab is a real Link so URLs stay meaningful + browser history works.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; icon: string }[] = [
  { href: "/pension", label: "תיקי הפנסיה", icon: "elderly" },
  { href: "/retirement", label: "תכנון פרישה", icon: "rocket_launch" },
];

export function PensionTabBar() {
  const pathname = usePathname();
  return (
    <div
      className="mb-6 flex gap-1 rounded-xl p-1"
      style={{ background: "rgba(1,45,29,0.04)" }}
      dir="rtl"
    >
      {TABS.map((t) => {
        const active = pathname === t.href || pathname?.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href as any}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
              active
                ? "bg-white text-verdant-ink shadow-sm"
                : "text-verdant-muted hover:text-verdant-ink"
            }`}
            style={active ? { boxShadow: "0 1px 3px rgba(1,45,29,0.08)" } : undefined}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
