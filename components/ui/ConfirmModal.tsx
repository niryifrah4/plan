"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Variant = "default" | "danger";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Morning-style confirmation modal. Replaces `window.confirm()` everywhere —
 * native confirm is blocked by iOS Safari inside PWAs (silently returns true),
 * meaning destructive actions executed without ever asking the user.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    confirmRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
      style={{
        background: "rgba(16, 24, 40, 0.4)",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl"
        style={{
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          boxShadow: "var(--morning-shadow-soft)",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        <div className="px-6 pb-2 pt-6">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              background: isDanger
                ? "var(--morning-danger-soft)"
                : "var(--morning-leaf-tint)",
              color: isDanger
                ? "var(--morning-danger)"
                : "var(--morning-forest)",
            }}
          >
            <span className="material-symbols-outlined text-[24px]">
              {isDanger ? "warning" : "help"}
            </span>
          </div>
          <h2
            id="confirm-modal-title"
            style={{
              fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
              fontSize: 20,
              lineHeight: "26px",
              fontWeight: 700,
              color: "var(--morning-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
          {body && (
            <p
              className="mt-2"
              style={{
                fontSize: 14,
                lineHeight: "20px",
                color: "var(--morning-muted)",
              }}
            >
              {body}
            </p>
          )}
        </div>
        <div className="flex flex-row-reverse gap-3 px-6 pb-6 pt-4">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="btn btn-md flex-1"
            style={
              isDanger
                ? {
                    background: "var(--morning-danger)",
                    color: "#fff",
                  }
                : {
                    background: "var(--morning-forest)",
                    color: "#fff",
                  }
            }
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-md flex-1"
            style={{
              background: "var(--morning-surface)",
              color: "var(--morning-ink)",
              border: "1px solid var(--morning-border)",
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for Promise-based confirm — drop-in replacement for window.confirm().
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "למחוק את הקופה?", variant: "danger" });
 *   if (!ok) return;
 */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    options: Omit<ConfirmModalProps, "open" | "onConfirm" | "onCancel">;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { title: "" },
    resolve: null,
  });

  const confirm = useCallback(
    (
      options: Omit<ConfirmModalProps, "open" | "onConfirm" | "onCancel">,
    ): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setState({ open: true, options, resolve });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state]);

  const modal = (
    <ConfirmModal
      {...state.options}
      open={state.open}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, modal };
}
