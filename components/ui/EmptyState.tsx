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
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="material-symbols-outlined text-verdant-muted text-[40px] mb-3">
          {icon}
        </span>
        <div className="text-lg font-extrabold text-verdant-ink">{title}</div>
        {detail && <div className="text-sm text-verdant-muted font-bold mt-2 max-w-md">{detail}</div>}
        {ctaLabel && ctaHref && (
          <a
            href={ctaHref}
            className="btn-botanical mt-5 inline-flex items-center gap-2 text-sm"
          >
            {ctaLabel}
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </a>
        )}
      </div>
    </Card>
  );
}
