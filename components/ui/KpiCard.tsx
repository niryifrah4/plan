import Link from "next/link";
import { Card } from "./Card";
import { fmtILS } from "@/lib/format";
import { MoneyText } from "./MoneyText";

interface KpiCardProps {
  label: string;
  value: number;
  subline?: string;
  icon?: string;
  href?: string;
  signed?: boolean;
  /** Hex accent — colors the icon chip and top stripe. Defaults to forest green. */
  accent?: string;
}

export function KpiCard({
  label,
  value,
  subline,
  icon = "trending_up",
  href,
  signed,
  accent = "#2C7A5A",
}: KpiCardProps) {
  const body = (
    <Card
      className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        minHeight: 168,
        background: "var(--morning-surface)",
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 100%)` }}
      />
      <div className="mb-5 flex items-center justify-between">
        <div
          className="text-[12px] font-semibold tracking-[0.04em]"
          style={{ color: "var(--morning-muted)" }}
        >
          {label}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}14`, color: accent }}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div
        className="tabular text-[2.4rem] font-bold leading-none tracking-tight"
        style={{ color: "var(--morning-ink)", fontVariantNumeric: "tabular-nums" }}
      >
        <MoneyText className="text-[2.4rem] font-bold leading-none tracking-tight">
          {fmtILS(value, { signed })}
        </MoneyText>
      </div>
      {subline && (
        <div
          className="mt-4 border-t pt-4 text-sm"
          style={{ borderColor: "var(--morning-border)", color: "var(--morning-muted)" }}
        >
          {subline}
        </div>
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
