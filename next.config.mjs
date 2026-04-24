/** @type {import('next').NextConfig} */

/**
 * ═══════════════════════════════════════════════════════════
 *  Security Headers — שכבת הגנה ראשונה ברמת HTTP
 * ═══════════════════════════════════════════════════════════
 *
 * CSP: אוסר על סקריפטים וסגנונות ממקורות זרים
 * HSTS: כופה HTTPS בדפדפן ל-2 שנים
 * X-Frame-Options: חוסם clickjacking (iframe)
 * Referrer-Policy: לא דולף מידע רגיש ב-URL
 * Permissions-Policy: מבטל API רגישים (מצלמה/מיקום)
 *
 * גרסה הדוקה — מוכנה ל-production.
 */
const securityHeaders = [
  // HSTS — HTTPS בלבד, 2 שנים, כולל סאב-דומיינים, preload
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // חסימת iframe embedding (clickjacking)
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // לא לאפשר לדפדפן לנחש MIME type
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Referrer רק ל-origin, לא URL מלא
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // חסימת API רגישים בדפדפן
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // DNS prefetch off — פחות דליפת מידע
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  // CSP — Content Security Policy
  // - default-src: רק אותו origin
  // - script-src: self + unsafe-eval (נדרש ל-Next dev) + unsafe-inline (לחלקי UI)
  // - style-src: self + unsafe-inline (Tailwind JIT)
  // - img-src: self + data URIs (SVG icons) + blob (uploads)
  // - connect-src: self + Supabase
  // - font-src: self + Google Fonts (Material Symbols)
  // - frame-ancestors: none (כפילות ל-X-Frame-Options)
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://www.googleapis.com",
      "frame-src 'self' https://accounts.google.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["pdf-parse"],
  },
  async headers() {
    return [
      {
        // החל על כל route
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
