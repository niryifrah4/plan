/**
 * /m — mobile shell (PWA-first).
 *
 * Sibling to (client), not nested inside it: skips the desktop sidebar
 * and the heavy ClientShell. Auth itself is enforced by middleware.ts —
 * /m is not in PUBLIC_ROUTES, so unauthenticated requests bounce to /login.
 *
 * Phase 1 (this layout): minimal wrapper. The cream Morning background
 * inherits from globals.css, and RTL/lang from the root layout. We just
 * constrain width and add safe-area padding for notched iPhones.
 */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto w-full"
      style={{
        maxWidth: 480,
        minHeight: "100vh",
        background: "var(--morning-bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {children}
    </div>
  );
}
