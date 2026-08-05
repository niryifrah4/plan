import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type PageMetadata = {
  title: string;
  description: string;
};

const DEFAULT_DESCRIPTION =
  "plan — מערכת חכמה לתכנון פיננסי משפחתי. רואים את התמונה, מתכננים קדימה ומקבלים החלטות בביטחון.";

const ROUTE_METADATA: Record<string, PageMetadata> = {
  "/": { title: "plan · מערכת לתכנון פיננסי", description: DEFAULT_DESCRIPTION },
  "/login": {
    title: "התחברות · plan",
    description: "כניסה מאובטחת למערכת plan לתכנון פיננסי משפחתי.",
  },
  "/auth/callback": { title: "מתחברים · plan", description: "השלמת ההתחברות למערכת plan." },
  "/privacy": { title: "מדיניות פרטיות · plan", description: "מדיניות הפרטיות של מערכת plan." },
  "/terms": { title: "תנאי שימוש · plan", description: "תנאי השימוש במערכת plan." },
  "/login/forgot-password": {
    title: "שחזור סיסמה · plan",
    description: "שחזור סיסמה למערכת plan.",
  },
  "/login/reset-password": {
    title: "יצירת סיסמה חדשה · plan",
    description: "יצירת סיסמה חדשה למערכת plan.",
  },
  "/clear-storage": {
    title: "איפוס נתונים מקומיים · plan",
    description: "איפוס נתונים מקומיים במערכת plan.",
  },
  "/crm": { title: "ניהול לקוחות · plan", description: "ניהול לקוחות ופעילות יועץ במערכת plan." },
  "/crm/settings": { title: "הגדרות מערכת · plan", description: "הגדרות היועץ והמערכת ב־plan." },
  "/crm/settings/parsers": {
    title: "מיפויי מנפיקים · plan",
    description: "ניהול מיפויי מנפיקים במערכת plan.",
  },
  "/crm/settings/pension-parsers": {
    title: "פרסור פנסיה · plan",
    description: "ניהול פרסור דוחות פנסיה במערכת plan.",
  },
  "/crm/settings/subscriptions": {
    title: "קטלוג מנויים · plan",
    description: "ניהול קטלוג המנויים במערכת plan.",
  },
  "/crm/settings/cities": { title: "ניהול ערים · plan", description: "ניהול ערים במערכת plan." },
  "/crm/settings/hidden-merchants": {
    title: "עסקים מוסתרים · plan",
    description: "ניהול קטלוג עסקים מוסתרים במערכת plan.",
  },
  "/crm/settings/mappings": {
    title: "ספקים וקטגוריות · plan",
    description: "ניהול ספקים וקטגוריות במערכת plan.",
  },
  "/dashboard": {
    title: "תמונת מצב · plan",
    description: "תמונת המצב הפיננסית המשפחתית במערכת plan.",
  },
  "/budget": { title: "תקציב · plan", description: "ניהול התקציב והתזרים המשפחתי במערכת plan." },
  "/balance": { title: "מאזן · plan", description: "נכסים, התחייבויות ומאזן משפחתי במערכת plan." },
  "/files": { title: "מסמכים · plan", description: "ניהול מסמכים פיננסיים במערכת plan." },
  "/investments": { title: "השקעות · plan", description: "ניהול השקעות ותיקי נכסים במערכת plan." },
  "/debt": { title: "חובות ומשכנתאות · plan", description: "ניהול חובות ומשכנתאות במערכת plan." },
  "/goals": { title: "יעדים · plan", description: "תכנון ומעקב אחר יעדים פיננסיים במערכת plan." },
  "/plan": {
    title: "התוכנית הפיננסית · plan",
    description: "בניית התוכנית הפיננסית המשפחתית במערכת plan.",
  },
  "/family-workbook": {
    title: "חוברת משפחה · plan",
    description: "חוברת הנתונים הפיננסיים המשפחתית במערכת plan.",
  },
  "/insurance": {
    title: "ביטוחים · plan",
    description: "מיפוי ותכנון הביטוחים המשפחתיים במערכת plan.",
  },
  "/onboarding": {
    title: "היכרות פיננסית · plan",
    description: "תהליך ההיכרות והקליטה למערכת plan.",
  },
  "/tools": {
    title: "כלים ומחשבונים · plan",
    description: "כלים ומחשבונים לתכנון פיננסי במערכת plan.",
  },
  "/roadmap": {
    title: "מפת דרכים · plan",
    description: "מפת הדרכים הפיננסית המשפחתית במערכת plan.",
  },
  "/deposits": { title: "פיקדונות · plan", description: "ניהול פיקדונות וחסכונות במערכת plan." },
  "/equity": { title: "הון · plan", description: "תכנון ההון המשפחתי במערכת plan." },
  "/retirement": { title: "פרישה · plan", description: "תכנון הפרישה במערכת plan." },
  "/realestate": { title: "נדל״ן · plan", description: "ניהול ותכנון נכסי נדל״ן במערכת plan." },
  "/report": { title: "דוח פיננסי · plan", description: "הדוח הפיננסי המשפחתי במערכת plan." },
  "/pension": { title: "פנסיה · plan", description: "מיפוי ותכנון פנסיוני במערכת plan." },
  "/settings": { title: "הגדרות · plan", description: "הגדרות מערכת plan." },
  "/settings/subscriptions": {
    title: "ניהול מנויים · plan",
    description: "ניהול מנויים משפחתיים במערכת plan.",
  },
  "/settings/hidden-merchants": {
    title: "עסקים מוסתרים · plan",
    description: "ניהול עסקים מוסתרים במערכת plan.",
  },
  "/admin/cities": { title: "ניהול ערים · plan", description: "ניהול ערים במערכת plan." },
  "/m": { title: "תמונת מצב · plan", description: "תמונת המצב הפיננסית בגרסת המובייל של plan." },
  "/m/balance": { title: "מאזן · plan", description: "המאזן המשפחתי בגרסת המובייל של plan." },
  "/m/budget": { title: "תקציב · plan", description: "התקציב המשפחתי בגרסת המובייל של plan." },
  "/m/goals": { title: "יעדים · plan", description: "היעדים הפיננסיים בגרסת המובייל של plan." },
};

const setMeta = (selector: string, attribute: string, value: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    const [key, rawValue] =
      attribute === "property"
        ? ["property", selector.match(/property="([^"]+)"/)?.[1]]
        : ["name", selector.match(/name="([^"]+)"/)?.[1]];
    if (rawValue) element.setAttribute(key, rawValue);
    document.head.appendChild(element);
  }
  element.setAttribute("content", value);
};

export function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadata = ROUTE_METADATA[pathname] ?? {
      title: "העמוד לא נמצא · plan",
      description: "העמוד המבוקש לא נמצא במערכת plan.",
    };
    const canonicalUrl = new URL(pathname, window.location.origin).toString();
    const imageUrl = new URL("/plan-leaf-logo.png", window.location.origin).toString();

    document.title = metadata.title;
    document.documentElement.lang = "he";
    document.documentElement.dir = "rtl";
    setMeta('meta[name="description"]', "name", metadata.description);
    setMeta('meta[name="robots"]', "name", "noindex, nofollow, noarchive, nosnippet");
    setMeta('meta[property="og:title"]', "property", metadata.title);
    setMeta('meta[property="og:description"]', "property", metadata.description);
    setMeta('meta[property="og:image"]', "property", imageUrl);
    setMeta('meta[property="og:url"]', "property", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "name", metadata.title);
    setMeta('meta[name="twitter:description"]', "name", metadata.description);
    setMeta('meta[name="twitter:image"]', "name", imageUrl);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }, [pathname]);

  return null;
}
