/**
 * Step navigation bar — Previous / Next or Finish.
 *
 * On the final step the "next" button becomes a "סיום ומעבר לדשבורד" CTA
 * that triggers the consumer's `onFinish` (which commits the whole page
 * snapshot to the scoped localStorage namespace and fans out to the sync
 * engine).
 */

import { TOTAL_STEPS } from "./constants";

export function Navigation({
  step,
  onPrev,
  onNext,
  onFinish,
}: {
  step: number;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <div className="flex items-center gap-2">
        {step > 1 && (
          <button
            type="button"
            onClick={onPrev}
            className="btn-botanical-ghost flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>שלב קודם
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={onNext}
            className="btn-botanical flex items-center gap-2"
          >
            שלב הבא
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onFinish}
            className="btn-botanical flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>סיום ומעבר
            לדשבורד
          </button>
        )}
      </div>
    </div>
  );
}
