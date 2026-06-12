"use client";

import { useState } from "react";
import { NumberEditModal } from "@/components/ui/NumberEditModal";

interface ToolboxNumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  steps?: number[];
  min?: number;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  buttonClassName?: string;
  compact?: boolean;
}

function formatValue(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function defaultSteps(suffix?: string) {
  if (suffix === "%") return [0.1, 0.5, 1];
  if (suffix === "$") return [1, 5, 10];
  return [100, 500, 1000];
}

export function ToolboxNumberField({
  label,
  value,
  onChange,
  suffix,
  steps,
  min,
  disabled = false,
  className,
  labelClassName = "mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted",
  buttonClassName,
  compact = false,
}: ToolboxNumberFieldProps) {
  const [open, setOpen] = useState(false);
  const modalSteps = steps ?? defaultSteps(suffix);

  return (
    <div className={className}>
      <div className={labelClassName}>{label}</div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          `flex w-full items-center justify-between rounded-lg border bg-white px-3 ${
            compact ? "py-2" : "py-2.5"
          } text-left text-sm font-bold text-verdant-ink transition-colors hover:bg-[#FAFAF7] disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:opacity-60`
        }
        style={{ borderColor: "#E5E7EB" }}
      >
        <span className="material-symbols-outlined text-[15px] text-verdant-muted">edit</span>
        <span className="tabular" dir="ltr">
          {formatValue(value)}
          {suffix ? <span className="ml-1 text-xs text-verdant-muted">{suffix}</span> : null}
        </span>
      </button>
      {open && (
        <NumberEditModal
          title={label}
          initialValue={value}
          steps={modalSteps}
          min={min}
          onSave={(nextValue) => {
            onChange(nextValue);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
