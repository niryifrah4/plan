"use client";

/**
 * Floating auto-save status indicator.
 * Shows saving/saved/error state in bottom-left corner.
 */
export function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;

  const config = {
    saving: { icon: "cloud_sync", text: "שומר...", color: "#6B7280", bg: "#FAFAF7" },
    saved: { icon: "cloud_done", text: "השינויים נשמרו", color: "#059669", bg: "#05966915" },
    error: { icon: "cloud_off", text: "שגיאת שמירה", color: "#DC2626", bg: "#DC262615" },
  }[status];

  return (
    <div
      className="fixed bottom-5 left-5 z-50 flex animate-[fadeInUp_0.3s_ease-out] items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-md transition-all"
      style={{ background: config.bg, color: config.color, border: `1px solid ${config.color}25` }}
    >
      <span
        className={`material-symbols-outlined text-[16px] ${status === "saving" ? "animate-pulse" : ""}`}
      >
        {config.icon}
      </span>
      {config.text}
    </div>
  );
}
