import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verdant Ledger · plan",
  description: "מערכת תכנון פיננסי ללקוח — Hebrew RTL financial planning suite",
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
