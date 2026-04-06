/**
 * Asset Allocation Donut — SVG ring chart matching the original HTML.
 */

interface Slice {
  label: string;
  pct: number;
  color: string;
}

interface Props {
  slices: Slice[];
}

export function AssetDonut({ slices }: Props) {
  let offset = 0;
  return (
    <div>
      <div className="flex items-center justify-center mb-5">
        <svg width="150" height="150" viewBox="0 0 42 42" className="-rotate-90">
          {/* base ring */}
          <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#eef2e8" strokeWidth="5" />
          {slices.map((s, i) => {
            const el = (
              <circle
                key={i}
                cx="21"
                cy="21"
                r="15.9155"
                fill="transparent"
                stroke={s.color}
                strokeWidth="5"
                strokeDasharray={`${s.pct} ${100 - s.pct}`}
                strokeDashoffset={-offset}
              />
            );
            offset += s.pct;
            return el;
          })}
        </svg>
      </div>
      <div className="space-y-2.5 text-xs">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="text-verdant-ink font-semibold">{s.label}</span>
            </div>
            <span className="text-verdant-ink font-bold">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
