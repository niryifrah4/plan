"use client";

/**
 * MiniStat — compact label/value/sub block.
 * Used inside accordions and detail views where a full SolidKpi would be overkill.
 * Morning treatment: subtle leaf-tinted bg with dark ink text.
 */

interface MiniStatProps {
  label: string;
  value: string;
  sub?: string;
  /** Override the value color (use the canonical palette). */
  color?: string;
}

export function MiniStat({ label, value, sub, color }: MiniStatProps) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--morning-surface-2)",
        border: "1px solid var(--morning-border)",
      }}
    >
      <div
        className="text-[11px] font-medium tracking-[0.04em]"
        style={{ color: "var(--morning-muted)" }}
      >
        {label}
      </div>
      <div
        className="tabular mt-1 text-[15px] font-bold"
        style={{
          color: color ?? "var(--morning-ink)",
          fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-0.5 text-[11px]"
          style={{ color: "var(--morning-muted)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
