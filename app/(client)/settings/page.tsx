"use client";

import Link from "next/link";
import type { Route } from "next";

interface SettingsLink {
  href: Route;
  title: string;
  description: string;
  icon: string;
}

const LINKS: SettingsLink[] = [
  {
    href: "/settings/subscriptions" as Route,
    title: "ניהול מנויים",
    description:
      "החלט אילו בתי עסק נחשבים מנוי קבוע ואילו לא. אפשר לבטל סימון שנעשה בטעות ולעבור על כל בתי העסק שלך.",
    icon: "subscriptions",
  },
  {
    href: "/settings/hidden-merchants" as Route,
    title: "עסקים מוסתרים",
    description:
      "נהל את בתי העסק שבחרת להסתיר מהתזרים ומתור המיפוי. אפשר להסתיר חדשים, ולבטל הסתרה שנעשתה בטעות.",
    icon: "visibility_off",
  },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-verdant-ink">הגדרות</h1>
        <p className="mt-1 text-sm text-verdant-muted">
          ניהול ההעדפות והכללים של התיק שלך.
        </p>
      </header>

      <div className="grid gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-start gap-4 rounded-2xl border border-verdant-line bg-white p-4 transition-colors hover:border-verdant-accent/40 hover:bg-verdant-accent/[0.03]"
          >
            <span
              className="material-symbols-outlined shrink-0 rounded-xl p-2 text-[22px]"
              style={{ background: "rgba(44,122,90,0.10)", color: "#2C7A5A" }}
              aria-hidden
            >
              {link.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-verdant-ink">{link.title}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-verdant-muted">
                {link.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
