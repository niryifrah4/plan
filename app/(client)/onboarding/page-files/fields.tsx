/**
 * Reusable form atoms shared across every onboarding step.
 *
 *   • StepCard      — card wrapper with title + step number badge
 *   • Fld           — labeled text/number/email/date/tel input
 *   • FldSelect     — labeled <select> with a placeholder option
 *   • FldTextarea   — labeled multi-line input
 *   • DynTable      — generic dynamic-row table for assets/liabilities/goals
 *
 * Kept thin on purpose — they only handle layout + label binding. Field
 * names map directly into the `Fields` localStorage slice.
 */

import type { Fields } from "./types";
import { useState } from "react";
import { NumberEditModal } from "@/components/ui/NumberEditModal";

export function StepCard({
  num,
  title,
  icon,
  children,
}: {
  num: number;
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div
        className="border-b px-5 py-4 text-verdant-ink"
        style={{ background: "#FAFAF7", borderColor: "#E5E7EB" }}
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-verdant-emerald">
            {icon}
          </span>
          <h2 className="text-base font-extrabold">{title}</h2>
          <span className="mr-auto text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
            שלב {num}
          </span>
        </div>
      </div>
      <div className="space-y-6 p-6">{children}</div>
    </section>
  );
}

export function Fld({
  label,
  name,
  fields,
  onChange,
  type = "text",
  dir,
  placeholder,
  steps,
}: {
  label: string;
  name: string;
  fields: Fields;
  onChange: (n: string, v: string) => void;
  type?: string;
  dir?: string;
  placeholder?: string;
  steps?: number[];
}) {
  return (
    <div>
      <label className="mb-1 block px-0.5 text-[11px] font-bold text-verdant-ink">{label}</label>
      {type === "number" ? (
        <ModalNumberInput
          value={fields[name] || ""}
          onChange={(v) => onChange(name, v)}
          title={label}
          placeholder={placeholder}
          dir={dir}
          inputClassName="inp tabular"
          steps={steps}
        />
      ) : (
        <input
          className="inp"
          type={type}
          dir={dir}
          placeholder={placeholder}
          value={fields[name] || ""}
          onChange={(e) => onChange(name, e.target.value)}
        />
      )}
    </div>
  );
}

export function ModalNumberInput({
  value,
  onChange,
  title,
  placeholder,
  dir = "ltr",
  inputClassName = "inp tabular",
  wrapperClassName = "",
  steps,
}: {
  value: string;
  onChange: (value: string) => void;
  title: string;
  placeholder?: string;
  dir?: string;
  inputClassName?: string;
  wrapperClassName?: string;
  steps?: number[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={`relative ${wrapperClassName}`}>
        <input
          className={`${inputClassName} pl-10`}
          type="text"
          inputMode="decimal"
          dir={dir}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-transparent text-verdant-muted transition-colors hover:bg-[#FAFAF7] hover:text-verdant-ink"
          aria-label={`פתח עריכה מדויקת עבור ${title}`}
          title={`פתח עריכה מדויקת עבור ${title}`}
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>
      </div>
      {open && (
        <NumberEditModal
          title={title}
          initialValue={value}
          steps={steps}
          onSave={(next) => {
            onChange(String(next));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function FldSelect({
  label,
  name,
  fields,
  onChange,
  options,
}: {
  label: string;
  name: string;
  fields: Fields;
  onChange: (n: string, v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="mb-1 block px-0.5 text-[11px] font-bold text-verdant-ink">{label}</label>
      <select
        className="inp"
        value={fields[name] || ""}
        onChange={(e) => onChange(name, e.target.value)}
      >
        <option value="">בחר...</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export function FldTextarea({
  label,
  name,
  fields,
  onChange,
}: {
  label: string;
  name: string;
  fields: Fields;
  onChange: (n: string, v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block px-0.5 text-[11px] font-bold text-verdant-ink">{label}</label>
      <textarea
        className="inp resize-none"
        rows={3}
        value={fields[name] || ""}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

export function DynTable<T extends Record<string, string>>({
  headers,
  rows,
  onUpdate,
  onRemove,
  renderRow,
  footer,
}: {
  headers: string[];
  rows: T[];
  onUpdate: (i: number, k: string, v: string) => void;
  onRemove: (i: number) => void;
  renderRow: (
    row: T,
    i: number,
    onUpdate: (i: number, k: string, v: string) => void
  ) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden" style={{ borderRadius: 8 }}>
      <table className="w-full text-sm">
        <thead className="v-divider border-b" style={{ background: "#FFFFFF" }}>
          <tr className="text-right">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted"
              >
                {h}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="v-divider divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="h-[30px]">
              {renderRow(r, i, onUpdate)}
              <td className="px-2">
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="text-verdant-muted transition-colors hover:text-red-600"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
