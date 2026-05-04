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

export function KpiCard({
  label,
  value,
  subline,
  icon = "trending_up",
  href,
  signed,
  accent = "#1B4332",
}: KpiCardProps) {
  const body = (
    <Card
      className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        minHeight: 168,
        background: `linear-gradient(180deg, ${accent}08 0%, #ffffff 60%)`,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 100%)` }}
      />
      <div className="mb-5 flex items-center justify-between">
        <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-verdant-muted">
          {label}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}18`, color: accent }}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div
        className="tabular text-[2.6rem] font-extrabold leading-none tracking-tight"
        style={{ color: accent }}
      >
        {fmtILS(value, { signed })}
      </div>
      {subline && (
        <div className="v-divider mt-4 border-t pt-4 text-sm text-verdant-muted">{subline}</div>
      )}
    </Card>
  );
  return href ? (
    <Link href={href as any} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
