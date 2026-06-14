"use client";

import Link from "next/link";
import {
  PENSION_PROVIDERS,
  FUND_TYPE_LABELS,
  STATUS_META,
  pensionParserCounts,
  type PensionProvider,
  type PensionReportType,
} from "@/lib/doc-parser/pension-parser-registry";

function StatusBadge({ status }: { status: PensionReportType["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function ReportRow({ report }: { report: PensionReportType }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-verdant-ink">{report.label}</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {report.fundTypes.map((ft) => (
              <span
                key={ft}
                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-verdant-muted"
              >
                {FUND_TYPE_LABELS[ft]}
              </span>
            ))}
          </div>
        </div>
        <StatusBadge status={report.status} />
      </div>

      {report.detect ? (
        <p className="mb-1.5 text-[11px] leading-relaxed text-verdant-muted">
          <span className="font-bold">זיהוי: </span>
          {report.detect}
        </p>
      ) : null}
      {report.notes ? (
        <p className="mb-1.5 text-[11px] leading-relaxed text-verdant-muted">{report.notes}</p>
      ) : null}
      {report.parserFile ? (
        <p className="rounded-xl bg-white px-3 py-2 text-[11px] text-verdant-muted">
          קובץ parser: <span dir="ltr">{report.parserFile}</span>
        </p>
      ) : null}
    </div>
  );
}

function ProviderCard({ provider }: { provider: PensionProvider }) {
  return (
    <article className="card-pad flex h-full flex-col gap-4 border border-transparent bg-white transition hover:border-verdant-accent/20 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-verdant-ink">{provider.label}</h3>
          <p className="mt-1 text-xs text-verdant-muted">
            {provider.aliases?.slice(0, 3).join(" · ") || ""}
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
          {provider.reports.length} סוגי קובץ
        </span>
      </div>

      <div className="space-y-3">
        {provider.reports.map((r) => (
          <ReportRow key={r.id} report={r} />
        ))}
      </div>
    </article>
  );
}

export default function PensionParsersSettingsPage() {
  const counts = pensionParserCounts();

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-verdant-ink">פרסור דוחות פנסיה וחיסכון</h1>
            <p className="mt-1 text-sm text-verdant-muted">
              סוגי הקבצים שהמערכת יודעת לקרוא — לפי חברה, סוג קובץ וסוג קרן (השתלמות / גמל / פנסיה).
            </p>
          </div>
          <Link
            href="/crm/settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-verdant-muted transition-all hover:bg-gray-100 hover:text-verdant-ink"
            style={{ background: "#FAFAF7" }}
            title="חזרה להגדרות"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">חברות</p>
            <p className="mt-1 text-2xl font-bold text-verdant-ink">{counts.providers}</p>
          </div>
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">סוגי קובץ</p>
            <p className="mt-1 text-2xl font-bold text-verdant-ink">{counts.reportTypes}</p>
          </div>
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">נתמך ומאומת</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "#166534" }}>
              {counts.supported}
            </p>
          </div>
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">גנרי / בפיתוח</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "#92400e" }}>
              {counts.generic + counts.planned}
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[11px] text-verdant-muted">
          <span className="font-bold text-verdant-ink">מקרא:</span>
          {(["supported", "generic", "planned"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: STATUS_META[s].color }}
              />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PENSION_PROVIDERS.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </div>
    </main>
  );
}
