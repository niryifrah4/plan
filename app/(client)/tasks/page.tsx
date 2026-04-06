import { PageHeader } from "@/components/ui/PageHeader";
import { healthScore } from "@/lib/tasks-engine";
import { demoTasks } from "@/lib/stub-data";

export default function TasksPage() {
  const tasks = demoTasks;
  const score = healthScore(tasks);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Action Center · מנוע המלצות"
        title="המלצות ומשימות"
        description="מנוע החוקים זיהה את הפערים הבאים — כל משימה מחוברת לתחנה רלוונטית"
      />

      <div className="v-card p-7 mb-6" style={{ minHeight: 120 }}>
        <div className="flex items-center justify-between">
          <div className="text-5xl font-extrabold text-verdant-ink tabular">{score}</div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">ציון בריאות פיננסי</div>
            <div className="text-sm text-verdant-muted mt-1">100 − 20×גבוה − 8×בינוני − 3×נמוך</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((t) => (
          <div key={t.id} className="v-card p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <span
                className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded ${
                  t.severity === "high"
                    ? "bg-red-100 text-red-700"
                    : t.severity === "medium"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {t.severity === "high" ? "גבוה" : t.severity === "medium" ? "בינוני" : "נמוך"}
              </span>
              <div className="flex-1 text-right">
                <h3 className="text-base font-bold text-verdant-ink">{t.title}</h3>
                {t.detail && <p className="text-sm text-verdant-muted mt-1 leading-relaxed">{t.detail}</p>}
                {t.cta_href && (
                  <a href={t.cta_href} className="inline-block mt-3 text-sm font-bold text-verdant-accent hover:text-verdant-emerald">למעבר לתחנה ←</a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
