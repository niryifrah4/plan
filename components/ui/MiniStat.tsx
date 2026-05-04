"use client";

/**
 * MiniStat — compact label/value/sub block.
 *
 * Used inside accordions and detail views where a full SolidKpi would be
 * overkill. Before this file existed it was redefined inline in
 * /realestate, /debt, /investments, /equity — each with slightly
 * different padding and color logic. This is the SoT.
 */

interface MiniStatProps {
  label: string;
  value: string;
  /** Optional one-line caption beneath the value. */
  sub?: string;
  /** Override the value color (use the canonical palette). */
  color?: string;
}

export function MiniStat({ label, value, sub, color }: MiniStatProps) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "rgba(1,45,29,0.03)",
        border: "1px solid rgba(1,45,29,0.06)",
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-verdant-muted">
        {label}
      </div>
      <div
        className="tabular mt-1 text-[15px] font-extrabold"
        style={{ color: color ?? "#012D1D" }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-verdant-muted">{sub}</div>}
    </div>
  );
}
