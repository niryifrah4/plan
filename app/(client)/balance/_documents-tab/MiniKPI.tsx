/**
 * Compact KPI tile used inside the document review header.
 * 3 of these sit in a row above the progress bar.
 */

export function MiniKPI({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#FFFFFF" }}>
      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
        {label}
      </div>
      <div
        className="text-sm font-extrabold"
        style={{ color: color || "#FFFFFF", fontFamily: "inherit" }}
      >
        {value}
      </div>
    </div>
  );
}
