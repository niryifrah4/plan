import type { Metadata, Viewport } from "next";
import { Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { logEnvStatus } from "@/lib/env";

// server-only boot log
if (typeof window === "undefined") logEnvStatus();

// Self-hosted, preloaded, swap-displayed fonts.
// Previously the <head> blocked render on a Google Fonts CSS round-trip
// for THREE families (Heebo + Rubik + Inter), adding ~300-1500ms to first
// paint depending on network. next/font self-hosts the files in our own
// bundle + emits <link rel="preload"> automatically. Inter was never used
// anywhere in the codebase so it's dropped entirely.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-heebo",
});

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "plan · מערכת לתכנון פיננסי",
  description: "plan — מערכת לתכנון פיננסי ללקוח",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "plan",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#F4F5F0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${rubik.variable}`}>
      <head>
        {/* Material Symbols — kept as blocking stylesheet for now. Replacing
            the icon-by-icon usage with inline SVG would be a larger sweep;
            the first-paint win this commit focuses on comes from dropping
            the Heebo/Rubik/Inter Google Fonts round trip (now self-hosted
            via next/font above). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
