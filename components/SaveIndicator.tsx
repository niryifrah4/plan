"use client";

/**
 * Floating auto-save status indicator.
 * Shows saving/saved/error state in bottom-left corner.
 */
export function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;

  const config = {
    saving: { icon: "cloud_sync", text: "שומר...", color: "#94A3B8", bg: "#1A2438" },
    saved: { icon: "cloud_done", text: "השינויים נשמרו", color: "#4ADE80", bg: "#4ADE8015" },
    error: { icon: "cloud_off", text: "שגיאת שמירה", color: "#F87171", bg: "#F8717115" },
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
