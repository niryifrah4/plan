import type { Metadata, Viewport } from "next";
import "./globals.css";
import { logEnvStatus } from "@/lib/env";

// server-only boot log
if (typeof window === "undefined") logEnvStatus();

export const metadata: Metadata = {
  title: "פלאן · מערכת לתכנון פיננסי",
  description: "פלאן — מערכת לתכנון פיננסי ללקוח",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "פלאן",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#012D1D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
