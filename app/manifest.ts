import type { MetadataRoute } from "next";

/**
 * PWA manifest — lets Chrome/Edge/Safari treat /plan as an installable
 * standalone app. Once installed, it lives in the Dock (macOS) /
 * Start menu (Windows) / home screen (mobile) with its own icon, opens
 * in a chrome-less window, and updates automatically when the deploy
 * refreshes. (2026-05-15 per Nir: "אפליקציה שאוכל לפתוח בבוקר".)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "plan · מערכת לתכנון פיננסי",
    short_name: "plan",
    description: "תכנון פיננסי, תזרים מזומנים, השקעות וחובות במקום אחד",
    // Installed PWA opens the mobile cashflow tool directly. Desktop users
    // who install will also land here (480px frame, mobile-first). Scope
    // stays "/" so the install can navigate to /dashboard / /crm too.
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F4F5F0",
    theme_color: "#F4F5F0",
    lang: "he",
    dir: "rtl",
    categories: ["finance", "productivity", "lifestyle"],
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
