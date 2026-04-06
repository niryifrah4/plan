import Link from "next/link";
import { Card } from "./Card";
import { fmtILS } from "@/lib/format";

interface KpiCardProps {
  label: string;
  value: number;
  subline?: string;
  icon?: string;
  href?: string;
  /** Force sign display (e.g. for net worth). */
  signed?: boolean;
}

export function KpiCard({ label, value, subline, icon = "trending_up", href, signed }: KpiCardProps) {
  const body = (
    <Card className="hover:shadow-lg transition-shadow" style={{ minHeight: 168 }}>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">
          {label}
        </div>
        <span className="material-symbols-outlined text-verdant-emerald text-[20px]">
          {icon}
        </span>
      </div>
      <div className="text-4xl font-extrabold text-verdant-ink tabular tracking-tight">
        {fmtILS(value, { signed })}
      </div>
      {subline && (
        <div className="mt-4 pt-4 border-t v-divider text-xs text-verdant-muted">
          {subline}
        </div>
      )}
    </Card>
  );
  return href ? <Link href={href as any} className="block h-full">{body}</Link> : body;
}
