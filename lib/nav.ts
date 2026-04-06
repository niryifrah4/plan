/**
 * Client journey navigation order (RTL sidebar).
 * Matches the canonical "Plan-Based" flow: onboarding → dashboard → docs → actuals →
 * budget → tasks → retirement → wealth → goals → toolbox.
 */

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string; // Material Symbol name
}

export const NAV_CLIENT: NavItem[] = [
  { id: "onboarding",  label: "שאלון אפיון",          href: "/onboarding",    icon: "assignment" },
  { id: "dashboard",   label: "דשבורד",               href: "/dashboard",     icon: "dashboard" },
  { id: "documents",   label: "סריקת מסמכים",         href: "/documents",     icon: "upload_file" },
  { id: "cashflow",    label: "מאזן ותזרים",          href: "/cashflow-map",  icon: "account_balance" },
  { id: "budget",      label: "תקציב ובקרה",          href: "/budget",        icon: "account_balance_wallet" },
  { id: "tasks",       label: "המלצות ומשימות",       href: "/tasks",         icon: "checklist" },
  { id: "retirement",  label: "פנסיה ופרישה",         href: "/retirement",    icon: "elderly" },
  { id: "wealth",      label: "מפת עושר",             href: "/wealth",        icon: "insights" },
  { id: "vision",      label: "מטרות ויעדים",         href: "/vision",        icon: "flag" },
  { id: "toolbox",     label: "ארגז כלים",             href: "/toolbox",       icon: "calculate" },
];
