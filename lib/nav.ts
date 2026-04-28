/**
 * Sidebar navigation — Finav-inspired architecture.
 *
 * Layout:
 *   • Top standalone items (always visible)
 *   • 3 collapsible groups (תזרים / נכסים / תכנון)
 *   • Bottom standalone items
 *
 * Group open/closed state persists in localStorage under `verdant:nav:groups`.
 */

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string; // Material Symbol name
  badge?: string;
}

export interface NavGroup {
  /** Unique id used for open/closed persistence. */
  id: string;
  /** Group header label. If null, group renders flat (no header, not collapsible). */
  label: string | null;
  /** Icon for group header (Material Symbol). Only used when label is set. */
  icon?: string;
  /** If true, group is collapsible. Flat groups ignore this. */
  collapsible?: boolean;
  /** Default open state for collapsible groups. */
  defaultOpen?: boolean;
  items: NavItem[];
}

export const NAV_SECTIONS: NavGroup[] = [
  // ── Top: always visible ────────────────────────────────────────────
  {
    id: "top",
    label: null,
    items: [
      { id: "onboarding", label: "אפיון הלקוח", href: "/onboarding", icon: "assignment" },
      { id: "dashboard",  label: "תמונת מצב",   href: "/dashboard",  icon: "dashboard" },
    ],
  },

  // ── Group 1: תזרים חודשי ──────────────────────────────────────────
  {
    id: "cashflow",
    label: "תזרים חודשי",
    icon: "trending_up",
    collapsible: true,
    defaultOpen: true,
    items: [
      { id: "budget",   label: "תזרים חודשי",   href: "/budget",   icon: "pie_chart" },
      { id: "deposits", label: "הפקדות חודשיות", href: "/deposits", icon: "savings" },
      { id: "balance",  label: "מאזן וחשבונות",  href: "/balance",  icon: "account_balance_wallet" },
      { id: "files",    label: "קבצים במיפוי",    href: "/files",    icon: "folder_open" },
    ],
  },

  // ── Group 2: נכסים והלוואות ───────────────────────────────────────
  {
    id: "assets",
    label: "נכסים והלוואות",
    icon: "inventory_2",
    collapsible: true,
    defaultOpen: true,
    items: [
      { id: "investments", label: "שוק ההון",       href: "/investments", icon: "candlestick_chart" },
      { id: "equity",      label: "Equity (RSU/ESPP)", href: "/equity",    icon: "stacked_bar_chart" },
      { id: "pension",     label: "פנסיה ופרישה",   href: "/pension",     icon: "elderly" },
      { id: "realestate",  label: "נדל״ן",          href: "/realestate",  icon: "home_work" },
      { id: "debt",        label: "חובות והלוואות", href: "/debt",        icon: "credit_score" },
      { id: "insurance",   label: "ניהול סיכונים",  href: "/insurance",   icon: "shield" },
    ],
  },

  // ── Group 3: תכנון עתידי ───────────────────────────────────────────
  {
    id: "future",
    label: "תכנון עתידי",
    icon: "rocket_launch",
    collapsible: true,
    defaultOpen: true,
    items: [
      { id: "goals",      label: "מטרות וחזון",     href: "/goals",      icon: "flag" },
      { id: "retirement", label: "תכנון פרישה",    href: "/retirement", icon: "beach_access" },
      { id: "plan",       label: "תוכנית פעולה",   href: "/plan",       icon: "checklist" },
    ],
  },

  // ── Bottom: כלים ──────────────────────────────────────────────────
  {
    id: "tools",
    label: null,
    items: [
      { id: "tools", label: "מחשבונים", href: "/tools", icon: "calculate" },
    ],
  },
];

/** Flat list for iteration (e.g. "next/prev" navigation). */
export const NAV_CLIENT: NavItem[] = NAV_SECTIONS.flatMap(s => s.items);
