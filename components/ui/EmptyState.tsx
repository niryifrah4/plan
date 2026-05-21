import { Card } from "./Card";

interface EmptyStateProps {
  icon?: string;
  title: string;
  detail?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function EmptyState({ icon = "inbox", title, detail, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <Card className="items-center text-center" style={{ minHeight: 220 }}>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "var(--morning-leaf-tint)",
            color: "var(--morning-forest)",
          }}
        >
          <span className="material-symbols-outlined text-[28px]">{icon}</span>
        </div>
        <div
          className="text-lg font-semibold"
          style={{ color: "var(--morning-ink)" }}
        >
          {title}
        </div>
        {detail && (
          <div
            className="mt-2 max-w-md text-sm"
            style={{ color: "var(--morning-muted)" }}
          >
            {detail}
          </div>
        )}
        {ctaLabel && ctaHref && (
          <a
            href={ctaHref}
            className="btn-botanical mt-5 inline-flex items-center gap-2 text-sm"
          >
            {ctaLabel}
            {/* RTL: arrow_forward points right, the direction of "forward" in Hebrew */}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        )}
      </div>
    </Card>
  );
}
