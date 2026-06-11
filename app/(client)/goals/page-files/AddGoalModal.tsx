"use client";

import { useState, useEffect } from "react";
import { BucketPriority, BUCKET_COLORS } from "@/lib/buckets-store";
import { type Scope, SCOPE_COLORS } from "@/lib/scope-types";
import { Modal } from "./Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import {
  Field,
  InstrumentSelect,
  INSTRUMENTS,
  BUCKET_PRESETS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  taxRecommendation,
} from "./shared";

export function AddGoalModal({
  open,
  onSave,
  onClose,
}: {
  open: boolean;
  onSave: (input: {
    name: string;
    targetAmount: number;
    targetDate: string;
    currentAmount: number;
    monthlyContribution: number;
    expectedAnnualReturn: number;
    priority: BucketPriority;
    fundingSource?: string;
    color?: string;
    scope?: Scope;
    initialCash?: number;
  }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState(
    new Date(Date.now() + 3 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]
  );
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("5.0");
  const [priority, setPriority] = useState<BucketPriority>("medium");
  const [fundingSource, setFundingSource] = useState("money-market");
  const [color, setColor] = useState<string>(BUCKET_COLORS[0]);
  const [scope, setScope] = useState<Scope | undefined>(undefined);
  const [initialCash, setInitialCash] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setTargetAmount("");
      setTargetDate(new Date(Date.now() + 3 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]);
      setMonthlyContribution("");
      setExpectedReturn("5.0");
      setPriority("medium");
      setFundingSource("money-market");
      setColor(BUCKET_COLORS[0]);
      setScope(undefined);
      setInitialCash("");
    }
  }, [open]);

  const applyPreset = (preset: (typeof BUCKET_PRESETS)[0]) => {
    setName(preset.name);
    setTargetAmount(preset.targetAmount.toString());
    setTargetDate(
      new Date(Date.now() + preset.years * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]
    );
    setPriority(preset.priority);
    setFundingSource(preset.instrument);
    setColor(preset.color);
    const inst = INSTRUMENTS[preset.instrument];
    if (inst) setExpectedReturn((inst.rate * 100).toFixed(1));
  };

  const handleInstrumentChange = (key: string) => {
    setFundingSource(key);
    const inst = INSTRUMENTS[key];
    if (inst) setExpectedReturn((inst.rate * 100).toFixed(1));
  };

  const years = (new Date(targetDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  const amount = parseFloat(targetAmount) || 0;
  const tip = taxRecommendation(years, amount);
  const currentInst = INSTRUMENTS[fundingSource];

  const { confirm, modal: confirmModal } = useConfirm();

  const handleClose = async () => {
    const isDirty =
      name.trim() !== "" ||
      targetAmount.trim() !== "" ||
      monthlyContribution.trim() !== "" ||
      initialCash.trim() !== "" ||
      expectedReturn !== "5.0" ||
      priority !== "medium" ||
      fundingSource !== "money-market" ||
      color !== BUCKET_COLORS[0] ||
      scope !== undefined;

    if (isDirty) {
      const ok = await confirm({
        title: "לסגור בלי לשמור?",
        body: "הזנת נתונים בטופס. האם אתה בטוח שברצונך לצאת ללא שמירה?",
        confirmLabel: "כן, צא",
        cancelLabel: "ביטול",
        variant: "danger",
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <>
      <Modal open={open} title="מטרה חדשה" onClose={handleClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-[10px] font-bold text-verdant-muted">בחר תבנית מוכנה:</div>
          <div className="flex flex-wrap gap-2">
            {BUCKET_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPreset(p)}
                title={p.name}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg p-2.5 sm:px-3 sm:py-2 text-[11px] font-bold transition-all hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-md active:scale-95"
                style={{
                  background: `${p.color}10`,
                  color: "#1A1A1A",
                  border: `1px solid ${p.color}30`,
                }}
              >
                <span
                  className="material-symbols-outlined text-[18px] sm:text-[14px]"
                  style={{ color: p.color }}
                >
                  {p.icon}
                </span>
                <span className="hidden sm:inline">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field
            label="שם המטרה"
            value={name}
            onChange={setName}
            placeholder="למשל: החלפת רכב"
          />
          <Field
            label="סכום יעד (₪)"
            value={targetAmount}
            onChange={setTargetAmount}
            type="number"
            placeholder="150000"
            useNumberModal
            min={0}
          />
          <Field label="תאריך יעד" value={targetDate} onChange={setTargetDate} type="date" />
          <Field
            label="הפקדה חודשית (₪)"
            value={monthlyContribution}
            onChange={setMonthlyContribution}
            type="number"
            placeholder="2000"
            useNumberModal
            min={0}
          />
          <Field
            label="תשואה צפויה %"
            value={expectedReturn}
            onChange={setExpectedReturn}
            type="number"
          />
        </div>

        <Field
          label="סכום מזומן שיש לך היום ליעד הזה (אופציונלי)"
          value={initialCash}
          onChange={setInitialCash}
          type="number"
          placeholder="₪0"
          useNumberModal
          min={0}
        />

        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">מכשיר</div>
          <InstrumentSelect
            value={fundingSource}
            onChange={handleInstrumentChange}
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}
          />
          {currentInst && (
            <div
              className="mt-1.5 text-[9px] font-bold leading-relaxed"
              style={{ color: "#6B7280" }}
            >
              {currentInst.taxNote}
            </div>
          )}
        </div>

        {tip && (
          <div
            className="rounded-lg p-3"
            style={{ background: "#FAFAF7", border: "1px solid #93c5fd30" }}
          >
            {tip.split("\n").map((line, i) => (
              <div
                key={i}
                className="text-[11px] font-bold leading-relaxed"
                style={{ color: "#1e40af" }}
              >
                {line}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="ml-1 text-[9px] font-bold text-verdant-muted">עדיפות:</div>
          {(["high", "medium", "low"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className="rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all"
              style={{
                background: priority === p ? PRIORITY_COLORS[p].text : "#E5E7EB",
                color: priority === p ? "#FFFFFF" : PRIORITY_COLORS[p].text,
              }}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="ml-1 text-[9px] font-bold text-verdant-muted">ייעוד:</div>
          {[
            { key: undefined as Scope | undefined, label: "פרטי" },
            { key: "business" as const, label: "עסקי" },
            { key: "mixed" as const, label: "מעורב" },
          ].map((opt) => {
            const active = scope === opt.key;
            const sColor = opt.key ? SCOPE_COLORS[opt.key] : SCOPE_COLORS.personal;
            return (
              <button
                key={String(opt.key)}
                type="button"
                onClick={() => setScope(opt.key)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all"
                style={{
                  background: active ? sColor : "#E5E7EB",
                  color: active ? "#FFFFFF" : sColor,
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: active ? "#FFFFFF" : sColor }}
                />
                {opt.label}
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t pt-4"
          style={{ borderColor: "#E5E7EB" }}
        >
          <button onClick={handleClose} className="btn-botanical-ghost !px-4 !py-2 text-[12px]">
            ביטול
          </button>
          <button
            disabled={!name || !targetAmount}
            onClick={() =>
              onSave({
                name,
                targetAmount: parseFloat(targetAmount) || 0,
                targetDate,
                currentAmount: 0,
                monthlyContribution: parseFloat(monthlyContribution) || 0,
                expectedAnnualReturn: (parseFloat(expectedReturn) || 5) / 100,
                priority,
                fundingSource,
                color,
                scope,
                initialCash: parseFloat(initialCash) || 0,
              })
            }
            className="btn-botanical !px-5 !py-2 text-[12px] disabled:opacity-40"
          >
            הוסף מטרה
          </button>
        </div>
      </div>
      </Modal>
      {confirmModal}
    </>
  );
}
