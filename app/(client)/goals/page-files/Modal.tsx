"use client";

import { useEffect } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-8"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="relative my-auto w-full max-w-2xl rounded-2xl"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between rounded-t-2xl border-b px-6 py-4"
          style={{ borderColor: "#E5E7EB" }}
        >
          <h3 className="text-base font-extrabold text-verdant-ink">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:opacity-80"
            style={{ background: "#FAFAF7", color: "#6B7280" }}
            title="סגור"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
