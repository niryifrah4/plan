"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ISSUERS,
  type Issuer,
  type IssuerKind,
  type ParserVariant,
} from "@/lib/doc-parser/issuer-registry";
import TestModal from "./TestModal";

type IssuerStatusRow = {
  issuer_id: string;
  verified: boolean;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

type IssuerStatus = {
  verified: boolean;
  notes: string;
  updatedAt?: string;
};

const sectionLabels: Record<IssuerKind, { title: string; description: string }> = {
  credit: {
    title: "כרטיסי אשראי",
    description: "חברות ומותגי אשראי בישראל. parser ייעודי משמעו שקיים קוד מותאם לפורמט הספציפי.",
  },
  bank: {
    title: "חשבונות בנק",
    description: "בנקים בישראל שנבדקים כרגע דרך המנוע הגנרי עד שנוסיף parser ייעודי.",
  },
};

function normalizeStatus(row: IssuerStatusRow): IssuerStatus {
  return {
    verified: row.verified,
    notes: row.notes ?? "",
    updatedAt: row.updated_at,
  };
}

export default function ParserSettingsPage() {
  const [statuses, setStatuses] = useState<Record<string, IssuerStatus>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingIssuer, setTestingIssuer] = useState<Issuer | null>(null);

  useEffect(() => {
    async function loadStatuses() {
      try {
        const res = await fetch("/api/settings/issuer-status", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "read_failed");

        const nextStatuses: Record<string, IssuerStatus> = {};
        const nextNotes: Record<string, string> = {};
        for (const row of (data.statuses ?? []) as IssuerStatusRow[]) {
          nextStatuses[row.issuer_id] = normalizeStatus(row);
          nextNotes[row.issuer_id] = row.notes ?? "";
        }
        setStatuses(nextStatuses);
        setDraftNotes(nextNotes);
      } catch (err) {
        console.error("[issuer-status] load failed", err);
        toast.error("שגיאה בטעינת סטטוסי המיפוי");
      } finally {
        setLoading(false);
      }
    }

    loadStatuses();
  }, []);

  const counts = useMemo(() => {
    const statusIds = ISSUERS.flatMap((issuer) => [
      issuer.id,
      ...(issuer.parserVariants?.map((variant) => variant.id) ?? []),
    ]);
    const verified = statusIds.filter((id) => statuses[id]?.verified).length;
    const dedicated = ISSUERS.flatMap((issuer) => issuer.parserVariants ?? []).length;
    return { verified, dedicated, total: ISSUERS.length };
  }, [statuses]);

  const saveStatus = async (statusId: string, next: IssuerStatus) => {
    const previous = statuses[statusId] ?? { verified: false, notes: "" };

    setSavingId(statusId);
    setStatuses((current) => ({ ...current, [statusId]: next }));

    try {
      const res = await fetch("/api/settings/issuer-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerId: statusId,
          verified: next.verified,
          notes: next.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "write_failed");

      if (data.status) {
        setStatuses((current) => ({
          ...current,
          [statusId]: normalizeStatus(data.status as IssuerStatusRow),
        }));
      }
      toast.success("סטטוס המיפוי נשמר");
    } catch (err) {
      console.error("[issuer-status] save failed", err);
      setStatuses((current) => ({ ...current, [statusId]: previous }));
      setDraftNotes((current) => ({ ...current, [statusId]: previous.notes }));
      toast.error("שגיאה בשמירת סטטוס המיפוי");
    } finally {
      setSavingId(null);
    }
  };

  const handleVerifiedChange = (statusId: string, verified: boolean) => {
    const current = statuses[statusId] ?? { verified: false, notes: "" };
    const notes = draftNotes[statusId] ?? current.notes;
    saveStatus(statusId, { ...current, verified, notes });
  };

  const handleNotesBlur = (statusId: string) => {
    const current = statuses[statusId] ?? { verified: false, notes: "" };
    const notes = draftNotes[statusId] ?? "";
    if (notes === current.notes) return;
    saveStatus(statusId, { ...current, notes });
  };

  const renderStatusControls = ({
    statusId,
    title,
    notesPlaceholder,
    compact = false,
  }: {
    statusId: string;
    title: string;
    notesPlaceholder: string;
    compact?: boolean;
  }) => {
    const status = statuses[statusId] ?? { verified: false, notes: "" };
    const notes = draftNotes[statusId] ?? status.notes;
    const isSaving = savingId === statusId;

    return (
      <div className={compact ? "space-y-2" : "flex flex-1 flex-col gap-3"}>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
          <span className="text-sm font-medium text-verdant-ink">{title}</span>
          <input
            type="checkbox"
            checked={status.verified}
            disabled={loading || isSaving}
            onChange={(event) => handleVerifiedChange(statusId, event.target.checked)}
            className="h-5 w-5 accent-verdant-accent"
          />
        </label>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-verdant-muted" htmlFor={`notes-${statusId}`}>
            הערות
          </label>
          <textarea
            id={`notes-${statusId}`}
            value={notes}
            onChange={(event) =>
              setDraftNotes((current) => ({ ...current, [statusId]: event.target.value }))
            }
            onBlur={() => handleNotesBlur(statusId)}
            disabled={loading || isSaving}
            placeholder={notesPlaceholder}
            className={`rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-verdant-ink outline-none transition focus:border-verdant-accent focus:ring-2 focus:ring-verdant-accent/15 disabled:opacity-60 ${
              compact ? "min-h-16" : "min-h-24"
            }`}
          />
        </div>

        <span className="text-xs text-verdant-muted">
          {isSaving ? "שומר..." : status.updatedAt ? "עודכן" : "טרם נשמר"}
        </span>
      </div>
    );
  };

  const renderParserVariant = (variant: ParserVariant) => {
    return (
      <div key={variant.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-verdant-ink">{variant.label}</h4>
            {variant.description ? (
              <p className="mt-1 text-xs leading-relaxed text-verdant-muted">
                {variant.description}
              </p>
            ) : null}
          </div>
          <span className="inline-flex shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
            סוג פרסור
          </span>
        </div>
        <p className="mb-3 rounded-xl bg-white px-3 py-2 text-xs text-verdant-muted">
          קובץ parser: <span dir="ltr">{variant.parserFile}</span>
        </p>
        {renderStatusControls({
          statusId: variant.id,
          title: "הסוג הזה נבדק ואושר",
          notesPlaceholder: "למשל: מתאים לדף חיובים חודשי רגיל; אם יגיע פורמט אחר נפתח סוג פרסור נוסף.",
          compact: true,
        })}
      </div>
    );
  };

  const renderIssuerCard = (issuer: Issuer) => {
    return (
      <article
        key={issuer.id}
        className="card-pad flex h-full flex-col gap-4 border border-transparent bg-white transition hover:border-verdant-accent/20 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-verdant-ink">{issuer.label}</h3>
            <p className="mt-1 text-xs text-verdant-muted">
              {issuer.aliases?.slice(0, 3).join(" · ") || "אין aliases"}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              issuer.hasParser
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {issuer.hasParser ? "parser ייעודי" : "מנוע גנרי"}
          </span>
        </div>

        {issuer.parserFile ? (
          <p className="rounded-xl bg-verdant-bg px-3 py-2 text-xs text-verdant-muted">
            parser ראשי: <span dir="ltr">{issuer.parserFile}</span>
          </p>
        ) : null}

        {renderStatusControls({
          statusId: issuer.id,
          title: "המנפיק נבדק ואושר ידנית",
          notesPlaceholder: "למשל: נבדק מול קובץ יוני 2026, חסרה תמיכה בהחזרים...",
        })}

        {issuer.parserVariants?.length ? (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-verdant-ink">סוגי פרסור נתמכים</h4>
              <p className="mt-1 text-xs text-verdant-muted">
                אם יגיע תדפיס בפורמט אחר, נוסיף כאן וריאנט נוסף עם סטטוס בדיקה נפרד.
              </p>
            </div>
            {issuer.parserVariants.map(renderParserVariant)}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => setTestingIssuer(issuer)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-verdant-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">science</span>
            בדיקה
          </button>
          <span className="text-xs text-verdant-muted">הבדיקה מריצה את כל סוגי הפרסור</span>
        </div>
      </article>
    );
  };

  const renderSection = (kind: IssuerKind) => {
    const issuers = ISSUERS.filter((issuer) => issuer.kind === kind);
    const labels = sectionLabels[kind];

    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-verdant-ink">{labels.title}</h2>
          <p className="mt-1 text-sm text-verdant-muted">{labels.description}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {issuers.map(renderIssuerCard)}
        </div>
      </section>
    );
  };

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-6 py-8"
      style={{ background: "var(--verdant-bg)" }}
    >
      {testingIssuer ? (
        <TestModal issuer={testingIssuer} onClose={() => setTestingIssuer(null)} />
      ) : null}

      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-verdant-ink">מיפויי מנפיקים</h1>
            <p className="mt-1 text-sm text-verdant-muted">
              מעקב אחרי parser ייעודי, אישור ידני ובדיקת קבצים לדוגמה לבנקים ולכרטיסי אשראי.
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

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">סה״כ מנפיקים</p>
            <p className="mt-1 text-2xl font-bold text-verdant-ink">{counts.total}</p>
          </div>
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">parser ייעודי בקוד</p>
            <p className="mt-1 text-2xl font-bold text-verdant-ink">{counts.dedicated}</p>
          </div>
          <div className="card-pad bg-white">
            <p className="text-xs text-verdant-muted">נבדקו ואושרו ידנית</p>
            <p className="mt-1 text-2xl font-bold text-verdant-ink">{counts.verified}</p>
          </div>
        </div>

        {loading ? (
          <div className="card-pad bg-white text-sm text-verdant-muted">טוען סטטוסים...</div>
        ) : (
          <div className="space-y-10">
            {renderSection("credit")}
            {renderSection("bank")}
          </div>
        )}
      </div>
    </main>
  );
}
