/**
 * Confirmation screen shown after the user finishes mapping and saves a
 * document. Reports how many transactions made it into the cashflow,
 * how many duplicates were filtered (in-file and cross-session), and how
 * many manual category overrides the learner picked up.
 */

export function SavedView({
  effectiveTxCount,
  crossDupsSkipped,
  duplicatesRemoved,
  overrideCount,
  onUploadAnother,
}: {
  effectiveTxCount: number;
  crossDupsSkipped: number;
  duplicatesRemoved: number;
  overrideCount: number;
  onUploadAnother: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-10 text-center"
      style={{ background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      <div
        className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "rgba(16,185,129,0.1)" }}
      >
        <span className="material-symbols-outlined text-[28px] text-verdant-emerald">task_alt</span>
      </div>
      <h2
        className="mb-2 text-xl font-extrabold text-verdant-ink"
        style={{ fontFamily: "inherit" }}
      >
        הנתונים הועברו לתזרים
      </h2>
      <p className="mb-1 text-sm text-verdant-muted">
        {effectiveTxCount - crossDupsSkipped} תנועות נוספו בהצלחה
      </p>
      {duplicatesRemoved > 0 && (
        <p className="mb-1 text-xs font-bold" style={{ color: "#2C7A5A" }}>
          {duplicatesRemoved} כפילויות בתוך הקובץ הוסרו
        </p>
      )}
      {crossDupsSkipped > 0 && (
        <p className="mb-1 text-xs font-bold" style={{ color: "#2C7A5A" }}>
          <span className="material-symbols-outlined ml-0.5 align-middle text-[12px]">link</span>
          {crossDupsSkipped} תנועות כבר קיימות מהעלאות קודמות (עו״ש ↔ אשראי) — לא נוספו פעמיים
        </p>
      )}
      {overrideCount > 0 && (
        <p className="mb-3 text-xs font-bold text-blue-600">
          {overrideCount} תיקוני קטגוריה (למידה רוחבית)
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onUploadAnother}
          className="btn-botanical flex items-center gap-2 px-6 py-2.5 text-sm"
          style={{ fontFamily: "inherit" }}
        >
          <span className="material-symbols-outlined text-[16px]">upload_file</span>טען קובץ נוסף
        </button>
        <a
          href="/balance"
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-verdant-muted transition-colors hover:text-verdant-ink"
          style={{ background: "#FAFAF7" }}
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>עבור לתזרים
        </a>
      </div>
    </div>
  );
}
