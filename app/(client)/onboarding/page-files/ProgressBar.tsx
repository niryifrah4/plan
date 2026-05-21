/**
 * 5-step progress header for the onboarding questionnaire.
 *
 * Clicking a step circle jumps to it (the user can revisit earlier sections
 * after they've moved on). The auto-save status pill on the right shows
 * whether the most recent edit has been persisted to localStorage.
 */

import { STEP_LABELS, TOTAL_STEPS } from "./constants";

export function ProgressBar({
  step,
  saveStatus,
  onGoToStep,
}: {
  step: number;
  saveStatus: "idle" | "saving" | "saved";
  onGoToStep: (n: number) => void;
}) {
  return (
    <header className="mb-3">
      <div className="mb-2 flex items-center justify-end">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold"
          style={{ color: saveStatus === "saved" ? "#059669" : "#6B7280" }}
        >
          <span className="material-symbols-outlined text-[16px]">
            {saveStatus === "saving" ? "cloud_sync" : "cloud_done"}
          </span>
          <span>
            {saveStatus === "saving"
              ? "שומר..."
              : saveStatus === "saved"
                ? "נשמר אוטומטית"
                : "אוטומטי"}
          </span>
        </div>
      </div>

      <div className="card-pad">
        <div className="mb-3 flex items-center justify-between">
          {STEP_LABELS.map((label, i) => {
            const num = i + 1;
            const active = step === num;
            const done = step > num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => onGoToStep(num)}
                className="flex flex-1 flex-col items-center gap-1.5 transition-all"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold transition-all"
                  style={{
                    background: done ? "#059669" : active ? "#2C7A5A" : "#E5E7EB",
                    color: done || active ? "#FFFFFF" : "#6B7280",
                    boxShadow: active ? "0 0 0 3px rgba(44, 122, 90, 0.16)" : "none",
                  }}
                >
                  {done ? (
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  ) : (
                    num
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold ${active ? "text-verdant-ink" : "text-verdant-muted"}`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "#E5E7EB" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`,
              background: "#059669",
            }}
          />
        </div>
      </div>
    </header>
  );
}
