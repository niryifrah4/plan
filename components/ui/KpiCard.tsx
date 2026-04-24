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
  /** Hex accent — colors the icon chip, top bar, and number. Defaults to emerald. */
  accent?: string;
}

export function KpiCard({ label, value, subline, icon = "trending_up", href, signed, accent = "#1B4332" }: KpiCardProps) {
  const body = (
    <Card
      className="relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
      style={{
        minHeight: 168,
        background: `linear-gradient(180deg, ${accent}08 0%, #ffffff 60%)`,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 right-0 left-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 100%)` }}
      />
      <div className="flex items-center justify-between mb-5">
        <div className="text-[12px] uppercase tracking-[0.18em] text-verdant-muted font-bold">
          {label}
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div
        className="text-[2.6rem] font-extrabold tabular tracking-tight leading-none"
        style={{ color: accent }}
      >
        {fmtILS(value, { signed })}
      </div>
      {subline && (
        <div className="mt-4 pt-4 border-t v-divider text-sm text-verdant-muted">
          {subline}
        </div>
      )}
    </Card>
  );
  return href ? <Link href={href as any} className="block h-full">{body}</Link> : body;
}
