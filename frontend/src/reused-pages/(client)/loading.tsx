/**
 * Loading skeleton for the (client) route group.
 *
 * Next.js App Router shows this file automatically while a child segment's
 * server component is fetching. Without it, the user sees the previous page
 * frozen + a blank canvas until the new page hydrates. With it, they see a
 * calm placeholder that matches the page layout — feels intentional.
 */

export default function ClientLoading() {
  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-3 py-6 md:px-10 md:py-8">
      {/* Page header skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex-1">
          <div
            className="mb-2 h-3 w-16 rounded animate-pulse"
            style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
          />
          <div
            className="h-7 w-48 rounded animate-pulse"
            style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
          />
        </div>
        <div
          className="h-9 w-9 rounded-xl animate-pulse"
          style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
        />
      </div>

      {/* Hero card skeleton */}
      <div
        className="mb-6 rounded-2xl p-6 animate-pulse"
        style={{
          background: "var(--morning-surface, #FFFFFF)",
          border: "1px solid var(--morning-border, #e5e9dc)",
          minHeight: 180,
        }}
      >
        <div
          className="mb-3 h-3 w-24 rounded"
          style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
        />
        <div
          className="mb-6 h-10 w-40 rounded"
          style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
        />
        <div
          className="h-2 w-full rounded"
          style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
        />
      </div>

      {/* Card grid skeleton (3 cards) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-5 animate-pulse"
            style={{
              background: "var(--morning-surface, #FFFFFF)",
              border: "1px solid var(--morning-border, #e5e9dc)",
              minHeight: 140,
            }}
          >
            <div
              className="mb-3 h-3 w-20 rounded"
              style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
            />
            <div
              className="h-7 w-28 rounded"
              style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
            />
          </div>
        ))}
      </div>

      {/* Sr-only status for accessibility */}
      <p className="sr-only" role="status" aria-live="polite">
        טוען נתונים...
      </p>
    </div>
  );
}
