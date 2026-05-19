"use client";

import { useState } from "react";
import { Bucket, BucketPriority, BUCKET_COLORS } from "@/lib/buckets-store";
import { Modal } from "./Modal";
import {
  Field,
  InstrumentSelect,
  INSTRUMENTS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  taxRecommendation,
} from "./shared";

export function EditGoalModal({
  bucket,
  open,
  onSave,
  onClose,
  onDelete,
}: {
  bucket: Bucket;
  open: boolean;
  onSave: (patch: Partial<Bucket>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(bucket.name);
  const [targetAmount, setTargetAmount] = useState(bucket.targetAmount.toString());
  const [targetDate, setTargetDate] = useState(bucket.targetDate);
  const [monthlyContribution, setMonthlyContribution] = useState(
    bucket.monthlyContribution.toString()
  );
  const [expectedReturn, setExpectedReturn] = useState(
    (bucket.expectedAnnualReturn * 100).toFixed(1)
  );
  const [priority, setPriority] = useState<BucketPriority>(bucket.priority);
  const [fundingSource, setFundingSource] = useState(bucket.fundingSource || "money-market");
  const [color, setColor] = useState(bucket.color);
  const [initialCash, setInitialCash] = useState((bucket.initialCash || 0).toString());

  const years = (new Date(targetDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  const amount = parseFloat(targetAmount) || 0;
  const tip = taxRecommendation(years, amount);
  const currentInst = INSTRUMENTS[fundingSource];

  const handleInstrumentChange = (key: string) => {
    setFundingSource(key);
    const inst = INSTRUMENTS[key];
    if (inst) setExpectedReturn((inst.rate * 100).toFixed(1));
  };

  const handleSave = () => {
    onSave({
      name,
      targetAmount: parseFloat(targetAmount) || 0,
      targetDate,
      monthlyContribution: parseFloat(monthlyContribution) || 0,
      expectedAnnualReturn: (parseFloat(expectedReturn) || 5) / 100,
      priority,
      fundingSource,
      color,
      initialCash: parseFloat(initialCash) || 0,
    });
  };

  return (
    <Modal open={open} title="עריכת מטרה" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="שם המטרה" value={name} onChange={setName} />
          <Field
            label="סכום יעד (₪)"
            value={targetAmount}
            onChange={setTargetAmount}
            type="number"
          />
          <Field label="תאריך יעד" value={targetDate} onChange={setTargetDate} type="date" />
          <Field
            label="הפקדה חודשית (₪)"
            value={monthlyContribution}
            onChange={setMonthlyContribution}
            type="number"
          />
          <Field
            label="תשואה צפויה %"
            value={expectedReturn}
            onChange={setExpectedReturn}
            type="number"
          />
        </div>

        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">
            סכום מזומן שיש לך היום ליעד הזה (אופציונלי)
          </div>
          <input
            type="number"
            value={initialCash}
            onChange={(e) => setInitialCash(e.target.value)}
            placeholder="₪0"
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
            style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#0891b2" }}
          />
        </div>

        <div>
          <div className="mb-1 text-[9px] font-bold text-verdant-muted">מכשיר ההשקעה</div>
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

        <div className="flex items-center gap-3">
          <div className="ml-2 text-[9px] font-bold text-verdant-muted">עדיפות:</div>
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

        <div className="flex items-center gap-2">
          <div className="ml-1 text-[9px] font-bold text-verdant-muted">צבע:</div>
          {BUCKET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-6 w-6 rounded-full transition-all"
              style={{
                background: c,
                outline: color === c ? `2px solid ${c}` : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>

        <div
          className="flex items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: "#E5E7EB" }}
        >
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
            style={{ background: "rgba(248,113,113,0.08)", color: "#DC2626" }}
          >
            <span className="material-symbols-outlined text-[16px]">delete_outline</span>
            מחק מטרה
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="btn-botanical-ghost !px-4 !py-2 text-[12px]"
            >
              ביטול
            </button>
            <button onClick={handleSave} className="btn-botanical !px-5 !py-2 text-[12px]">
              שמור שינויים
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
