/**
 * Client journey navigation order (RTL sidebar).
 * Matches the canonical "Plan-Based" flow: onboarding → docs → dashboard → wealth →
 * cashflow → debt → retirement → investments → vision → tasks → toolbox.
 */

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string; // Material Symbol name
}

export const NAV_CLIENT: NavItem[] = [
  { id: "onboarding",  label: "שאלון אפיון",          href: "/onboarding",    icon: "assignment" },
  { id: "documents",   label: "תחנת אימות",           href: "/documents",     icon: "fact_check" },
  { id: "dashboard",   label: "דשבורד",               href: "/dashboard",     icon: "dashboard" },
  { id: "wealth",      label: "מפת נכסים",             href: "/wealth",        icon: "insights" },
  { id: "cashflow",    label: "תזרים ובקרה",          href: "/cashflow-map",  icon: "account_balance" },
  { id: "debt",        label: "הלוואות ומשכנתאות",    href: "/debt",          icon: "credit_score" },
  { id: "retirement",  label: "פנסיה ופרישה",         href: "/retirement",    icon: "elderly" },
  { id: "investments", label: "תיק השקעות ו-RSU",     href: "/investments",   icon: "candlestick_chart" },
  { id: "vision",      label: "מטרות, יעדים וחופש כלכלי", href: "/vision",   icon: "flag" },
  { id: "tasks",       label: "המלצות ומשימות",       href: "/tasks",         icon: "checklist" },
  { id: "toolbox",     label: "מחשבונים וכלים",       href: "/toolbox",       icon: "calculate" },
];
