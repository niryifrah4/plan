import { PageHeader } from "@/components/ui/PageHeader";
import { fmtILS } from "@/lib/format";
import { demoGoals } from "@/lib/stub-data";

const TRACK_LABEL: Record<string, string> = { on: "בדרך", behind: "בפיגור", at_risk: "בסיכון" };
const TRACK_COLOR: Record<string, string> = { on: "#0a7a4a", behind: "#f59e0b", at_risk: "#b91c1c" };

export default function VisionPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Goals &amp; Vision · מסלול ליעד"
        title="מטרות ויעדים"
        description="ה-FV הצפוי של כל מטרה מתעדכן אוטומטית בכל סגירת חודש"
      />

      <div className="space-y-3">
        {demoGoals.map((g) => {
          const pct = g.fv_projected != null
            ? Math.min(100, Math.round((g.fv_projected / g.target_amount) * 100))
            : 0;
          const color = TRACK_COLOR[g.track];
          return (
            <div key={g.id} className="v-card p-5 md:p-6">
              <div className="flex items-baseline justify-between mb-2">
                <span
                  className="text-[10px] font-extrabold uppercase px-2 py-1 rounded"
                  style={{ background: `${color}22`, color }}
                >
                  {TRACK_LABEL[g.track]}
                </span>
                <div className="text-right">
                  <h3 className="text-base font-bold text-verdant-ink">{g.name}</h3>
                  <div className="text-[11px] text-verdant-muted mt-0.5">
                    יעד: {new Date(g.target_date).toLocaleDateString("he-IL")}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-verdant-muted font-bold mb-1">
                <span>{pct}%</span>
                <span className="tabular">{fmtILS(g.fv_projected)} / {fmtILS(g.target_amount)}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "#eef2e8" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <div className="mt-3 pt-3 border-t v-divider flex items-center justify-between text-[11px] text-verdant-muted font-bold">
                <span className="tabular">הפקדה חודשית: {fmtILS(g.monthly_contrib)}</span>
                <span className="tabular">סכום פתיחה: {fmtILS(g.lump_today)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
