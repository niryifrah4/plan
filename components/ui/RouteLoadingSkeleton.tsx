interface RouteLoadingSkeletonProps {
  titleWidth?: string;
  hero?: boolean;
  rows?: number;
  cards?: number;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "var(--morning-leaf-tint, #e5e9dc)" }}
    />
  );
}

export function RouteLoadingSkeleton({
  titleWidth = "w-48",
  hero = true,
  rows = 4,
  cards = 3,
}: RouteLoadingSkeletonProps) {
  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-3 py-6 md:px-10 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="mb-2 h-3 w-16" />
          <SkeletonBlock className={`h-8 ${titleWidth}`} />
        </div>
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
      </div>

      {hero ? (
        <div
          className="mb-6 rounded-2xl p-5"
          style={{
            background: "var(--morning-surface, #FFFFFF)",
            border: "1px solid var(--morning-border, #e5e9dc)",
          }}
        >
          <SkeletonBlock className="mb-4 h-4 w-24" />
          <SkeletonBlock className="mb-5 h-10 w-44" />
          <SkeletonBlock className="h-3 w-full" />
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl p-4"
            style={{
              background: "var(--morning-surface, #FFFFFF)",
              border: "1px solid var(--morning-border, #e5e9dc)",
            }}
          >
            <SkeletonBlock className="mb-3 h-3 w-20" />
            <SkeletonBlock className="h-7 w-28" />
          </div>
        ))}
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--morning-surface, #FFFFFF)",
          border: "1px solid var(--morning-border, #e5e9dc)",
        }}
      >
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-verdant-border/60 py-3 last:border-b-0">
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
            <div className="flex-1">
              <SkeletonBlock className="mb-2 h-3 w-1/3" />
              <SkeletonBlock className="h-3 w-2/3" />
            </div>
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        טוען נתונים...
      </p>
    </div>
  );
}
