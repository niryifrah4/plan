"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  חיסכון לכל ילד — Kids Savings Section (clean/minimal)
 * ═══════════════════════════════════════════════════════════
 *
 * Summary card per kid: name, age, balance, monthly total, projected at 21.
 * All edit fields hidden in collapsible panel — click card to expand.
 * AddKidForm hidden behind "+ הוסף ילד" button.
 */

import { useState, useEffect, useMemo } from "react";
import { Card } from "./ui/Card";
import { fmtILS } from "@/lib/format";
import {
  loadKidsSavings,
  addKidSavings,
  updateKidSavings,
  deleteKidSavings,
  kidSavingsId,
  projectKidSavings,
  childAge,
  KIDS_TRACKS,
  KIDS_PROVIDERS,
  GOV_MONTHLY_DEPOSIT,
  PARENT_MONTHLY_MAX,
  BONUS_AGE_3,
  BONUS_BAR_MITZVA,
  BONUS_AGE_21,
  TAX_GEMEL,
  KIDS_SAVINGS_EVENT,
  type KidSavings,
  type KidProjection,
} from "@/lib/kids-savings-store";

/* ── Helpers ── */
const fmtAge = (age: number) => {
  const y = Math.floor(age);
  const m = Math.round((age - y) * 12);
  if (y === 0) return `${m} חודשים`;
  if (m === 0) return `${y}`;
  return `${y}.${Math.floor(m / 1.2)}`;
};

const TRACK_COLORS: Record<string, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#ef4444",
  halacha: "#2B694D",
};

/* ════════════════════════════════════════════════════════════
   Main section
   ════════════════════════════════════════════════════════════ */
export function KidsSavingsSection() {
  const [kids, setKids] = useState<KidSavings[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setKids(loadKidsSavings());
    const handler = () => setKids(loadKidsSavings());
    window.addEventListener(KIDS_SAVINGS_EVENT, handler);
    return () => window.removeEventListener(KIDS_SAVINGS_EVENT, handler);
  }, []);

  const projections = useMemo(() => kids.map((k) => projectKidSavings(k)), [kids]);

  /* Empty state */
  if (kids.length === 0 && !showAdd) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            הוסף ילד/ה
          </button>
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-verdant-ink">
            <span className="material-symbols-outlined text-verdant-emerald">child_care</span>
            חיסכון לכל ילד
          </h3>
        </div>
        <div className="py-8 text-center text-sm text-verdant-muted">
          <span className="material-symbols-outlined mb-2 block text-[40px] opacity-30">
            savings
          </span>
          לא הוגדרו חסכונות ילדים.
          <br />
          <span className="text-[11px]">הוסף ילדים בשאלון או ידנית כאן.</span>
        </div>
        {showAdd && (
          <AddKidForm
            onAdd={(kid) => {
              addKidSavings(kid);
              setKids(loadKidsSavings());
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </Card>
    );
  }

  return (
    <Card>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setEditingId(null);
          }}
          className="flex items-center gap-1 text-[11px] font-bold text-verdant-emerald hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">
            {showAdd ? "remove" : "add"}
          </span>
          {showAdd ? "בטל" : "הוסף ילד/ה"}
        </button>
        <h3 className="flex items-center gap-2 text-lg font-extrabold text-verdant-ink">
          <span className="material-symbols-outlined text-verdant-emerald">child_care</span>
          חיסכון לכל ילד
        </h3>
      </div>

      {/* Add form — collapsible */}
      {showAdd && (
        <div className="mb-4">
          <AddKidForm
            onAdd={(kid) => {
              addKidSavings(kid);
              setKids(loadKidsSavings());
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Per-child summary cards */}
      <div className="space-y-3">
        {kids.map((kid, i) => (
          <KidCard
            key={kid.id}
            kid={kid}
            projection={projections[i]}
            isEditing={editingId === kid.id}
            onToggle={() => setEditingId(editingId === kid.id ? null : kid.id)}
            onSave={(updated) => {
              updateKidSavings(kid.id, updated);
              setKids(loadKidsSavings());
              setEditingId(null);
            }}
            onDelete={() => {
              deleteKidSavings(kid.id);
              setKids(loadKidsSavings());
            }}
          />
        ))}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   KidCard — clean summary + collapsible edit panel
   ════════════════════════════════════════════════════════════ */

function KidCard({
  kid,
  projection,
  isEditing,
  onToggle,
  onSave,
  onDelete,
}: {
  kid: KidSavings;
  projection: KidProjection;
  isEditing: boolean;
  onToggle: () => void;
  onSave: (patch: Partial<KidSavings>) => void;
  onDelete: () => void;
}) {
  const trackColor = TRACK_COLORS[kid.track] || "#6b7280";
  const hasGift = (kid.giftTarget || 0) > 0;
  const totalMonthly = kid.monthlyDeposit + (kid.extraMonthly || 0);
  const progressPct = hasGift
    ? Math.min(100, Math.round((projection.totalNetAt21 / (kid.giftTarget || 1)) * 100))
    : Math.min(
        100,
        projection.yearsTo18 > 0
          ? Math.round((kid.currentBalance / projection.projectedAt18) * 100)
          : 100
      );

  return (
    <div className="v-divider overflow-hidden rounded-xl border bg-white">
      {/* ── Summary row — always visible ── */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3.5 transition-colors hover:bg-gray-50"
        onClick={onToggle}
      >
        {/* Left: chevron + monthly total + gap line */}
        <div className="flex items-center gap-3 text-left" dir="ltr">
          <span className="material-symbols-outlined text-[18px] text-verdant-muted">
            {isEditing ? "expand_less" : "expand_more"}
          </span>
          <div>
            <div className="text-[14px] font-extrabold tabular-nums text-verdant-ink">
              {fmtILS(totalMonthly)}
              <span className="text-[10px] font-bold text-verdant-muted">/חודש</span>
            </div>
            {hasGift && projection.giftGap > 0 && (
              <div className="text-[10px] font-bold" style={{ color: "#f59e0b" }}>
                חסר {fmtILS(projection.giftMonthlyNeeded)}/חודש ליעד
              </div>
            )}
            {hasGift && projection.giftGap <= 0 && (
              <div className="text-[10px] font-bold text-verdant-emerald">היעד מושג</div>
            )}
          </div>
        </div>

        {/* Right: avatar + name + age + balance + projection */}
        <div className="flex items-center gap-3">
          {/* Numbers */}
          <div className="text-right">
            <div className="text-[13px] font-extrabold text-verdant-ink">{kid.childName}</div>
            <div className="text-[10px] font-bold text-verdant-muted">
              גיל {fmtAge(projection.currentAge)} · יתרה {fmtILS(kid.currentBalance)}
            </div>
            <div className="text-[10px] font-bold" style={{ color: "#2563eb" }}>
              צפי גיל 21: {fmtILS(projection.totalNetAt21)}
            </div>
          </div>
          {/* Avatar */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${trackColor}15` }}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ color: trackColor }}>
              child_care
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar — always visible, thin */}
      <div className="px-4 pb-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              background: hasGift ? (projection.giftGap > 0 ? "#f59e0b" : "#22c55e") : trackColor,
            }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] font-bold text-verdant-muted">
          <span>{progressPct}%</span>
          <span>{hasGift ? `ליעד ${fmtILS(kid.giftTarget || 0)}` : "לגיל 18"}</span>
        </div>
      </div>

      {/* ── Edit panel — collapsible ── */}
      {isEditing && <EditKidPanel kid={kid} onSave={onSave} onDelete={onDelete} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Edit panel — detail & live calculator
   ════════════════════════════════════════════════════════════ */

function EditKidPanel({
  kid,
  onSave,
  onDelete,
}: {
  kid: KidSavings;
  onSave: (patch: Partial<KidSavings>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(kid.childName);
  const [dob, setDob] = useState(kid.dob);
  const [provider, setProvider] = useState(kid.provider);
  const [track, setTrack] = useState(kid.track);
  const [balance, setBalance] = useState(String(kid.currentBalance));
  const [parentDep, setParentDep] = useState(kid.parentDeposit > 0 ? PARENT_MONTHLY_MAX : 0);
  const [giftTarget, setGiftTarget] = useState(String(kid.giftTarget || ""));
  const [extraMonthly, setExtraMonthly] = useState(String(kid.extraMonthly || ""));
  const [extraVehicle, setExtraVehicle] = useState(kid.extraVehicle || "gemel");

  /* Live projection */
  const liveCalc = useMemo(() => {
    if (!dob) return null;
    const selectedTrack = KIDS_TRACKS.find((t) => t.key === track) || KIDS_TRACKS[1];
    const age = childAge(dob);
    const yearsTo21 = Math.max(0, 21 - age);
    if (yearsTo21 <= 0) return null;

    const monthlyDep = GOV_MONTHLY_DEPOSIT + parentDep;
    const bal = Number(balance) || 0;
    const extra = Number(extraMonthly) || 0;
    const target = Number(giftTarget) || 0;
    const r = selectedTrack.expectedReturn;
    const rM = r / 12;
    const n21 = yearsTo21 * 12;

    const projGross = bal * Math.pow(1 + rM, n21) + monthlyDep * ((Math.pow(1 + rM, n21) - 1) / rM);
    let milestones = 0;
    if (age < 3) milestones += BONUS_AGE_3 * Math.pow(1 + r, 21 - 3);
    if (age < 13) milestones += BONUS_BAR_MITZVA * Math.pow(1 + r, 21 - 13);
    const totalGross = projGross + milestones + BONUS_AGE_21;
    const deposited = bal + monthlyDep * n21;
    const netKids = totalGross - Math.max(0, totalGross - deposited) * TAX_GEMEL;

    let netExtra = 0;
    if (extra > 0) {
      const extraGross = extra * ((Math.pow(1 + rM, n21) - 1) / rM);
      const extraDep = extra * n21;
      netExtra = extraGross - Math.max(0, extraGross - extraDep) * TAX_GEMEL;
    }

    const totalNet = netKids + netExtra;
    const gap = target > 0 ? Math.max(0, target - totalNet) : 0;
    let monthlyNeeded = 0;
    if (gap > 0 && n21 > 0 && rM > 0) {
      monthlyNeeded = Math.ceil(((gap / 0.85) * rM) / (Math.pow(1 + rM, n21) - 1));
    } else if (gap > 0 && n21 > 0) {
      monthlyNeeded = Math.ceil(gap / n21);
    }

    return {
      yearsTo21: Math.round(yearsTo21 * 10) / 10,
      totalNet: Math.round(totalNet),
      gap: Math.round(gap),
      monthlyNeeded,
      trackReturn: r,
      trackLabel: selectedTrack.label,
    };
  }, [dob, track, balance, parentDep, giftTarget, extraMonthly]);

  return (
    <div className="v-divider space-y-3 border-t bg-gray-50 px-4 py-4">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            שם
          </label>
          <input className="inp w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            תאריך לידה
          </label>
          <input
            className="inp w-full"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            בית השקעות
          </label>
          <select
            className="inp w-full"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="">בחר...</option>
            {KIDS_PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            מסלול
          </label>
          <div className="grid grid-cols-3 gap-1">
            {KIDS_TRACKS.filter((t) => t.key !== "halacha").map((t) => (
              <button
                key={t.key}
                onClick={() => setTrack(t.key)}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition-all ${
                  track === t.key
                    ? "text-white shadow-sm"
                    : "bg-white text-verdant-ink hover:bg-gray-100"
                }`}
                style={{
                  borderColor: track === t.key ? TRACK_COLORS[t.key] : "#d8e0d0",
                  background: track === t.key ? TRACK_COLORS[t.key] : undefined,
                }}
              >
                {t.label}
                <div className="mt-0.5 text-[8px] font-bold opacity-80">
                  {(t.expectedReturn * 100).toFixed(1)}%
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            יתרה נוכחית ₪
          </label>
          <input
            className="inp w-full"
            type="number"
            min="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            הפקדת הורים (₪{PARENT_MONTHLY_MAX}/חודש)
          </label>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                { label: "כן", value: PARENT_MONTHLY_MAX },
                { label: "לא", value: 0 },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                onClick={() => setParentDep(opt.value)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-extrabold transition-all ${
                  parentDep === opt.value
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-gray-300 bg-white text-verdant-ink hover:bg-gray-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Target + extra */}
      <div className="v-divider border-t pt-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
              יעד גיל 21 ₪
            </label>
            <input
              className="inp w-full"
              type="number"
              min="0"
              step="10000"
              value={giftTarget}
              onChange={(e) => setGiftTarget(e.target.value)}
              placeholder="300,000"
            />
          </div>
          <div>
            <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
              הפקדה נוספת ₪/חודש
            </label>
            <input
              className="inp w-full"
              type="number"
              min="0"
              value={extraMonthly}
              onChange={(e) => setExtraMonthly(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
              כלי
            </label>
            <select
              className="inp w-full"
              value={extraVehicle}
              onChange={(e) => setExtraVehicle(e.target.value)}
            >
              <option value="gemel">קופ״ג להשקעה</option>
              <option value="broker">תיק מסחר</option>
            </select>
          </div>
        </div>

        {/* Live projection result */}
        {liveCalc && (
          <div
            className={`mt-3 rounded-lg border p-3 ${
              Number(giftTarget) > 0
                ? liveCalc.gap > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-green-200 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-right">
                {Number(giftTarget) > 0 ? (
                  liveCalc.gap > 0 ? (
                    <>
                      <div className="text-[12px] font-extrabold" style={{ color: "#b45309" }}>
                        חסר ~₪{liveCalc.monthlyNeeded}/חודש ליעד
                      </div>
                      <div className="text-[9px] font-bold text-verdant-muted">
                        {liveCalc.trackLabel} · {Math.round(liveCalc.yearsTo21)} שנים
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-green-700">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      היעד מושג!
                    </div>
                  )
                ) : (
                  <div className="text-[9px] font-bold text-verdant-muted">
                    {liveCalc.trackLabel} ({(liveCalc.trackReturn * 100).toFixed(1)}%) ·{" "}
                    {Math.round(liveCalc.yearsTo21)} שנים
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold text-verdant-muted">צפי נטו גיל 21</div>
                <div className="text-[15px] font-extrabold tabular-nums text-verdant-ink">
                  {fmtILS(liveCalc.totalNet)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSave({
              childName: name,
              dob,
              provider,
              track,
              currentBalance: Number(balance) || 0,
              parentDeposit: parentDep,
              monthlyDeposit: GOV_MONTHLY_DEPOSIT + parentDep,
              giftTarget: Number(giftTarget) || 0,
              extraMonthly: Number(extraMonthly) || 0,
              extraVehicle,
            })
          }
          className="btn-botanical flex-1 px-3 py-2 text-[12px]"
        >
          שמור
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-200 px-3 py-2 text-[12px] font-extrabold text-red-600 transition-colors hover:bg-red-50"
        >
          מחק
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Add kid form
   ════════════════════════════════════════════════════════════ */

function AddKidForm({
  onAdd,
  onCancel,
}: {
  onAdd: (kid: KidSavings) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [provider, setProvider] = useState("");
  const [track, setTrack] = useState("medium");
  const [balance, setBalance] = useState("0");
  const [parentDep, setParentDep] = useState(PARENT_MONTHLY_MAX);
  const [giftTarget, setGiftTarget] = useState("");
  const [extraMonthly, setExtraMonthly] = useState("");
  const [extraVehicle, setExtraVehicle] = useState("gemel");

  /* Live projection */
  const liveCalc = useMemo(() => {
    if (!dob) return null;
    const selectedTrack = KIDS_TRACKS.find((t) => t.key === track) || KIDS_TRACKS[1];
    const age = childAge(dob);
    const yearsTo21 = Math.max(0, 21 - age);
    if (yearsTo21 <= 0) return null;

    const monthlyDep = GOV_MONTHLY_DEPOSIT + parentDep;
    const bal = Number(balance) || 0;
    const extra = Number(extraMonthly) || 0;
    const target = Number(giftTarget) || 0;
    const r = selectedTrack.expectedReturn;
    const rM = r / 12;
    const n21 = yearsTo21 * 12;

    const projGross = bal * Math.pow(1 + rM, n21) + monthlyDep * ((Math.pow(1 + rM, n21) - 1) / rM);
    let milestones = 0;
    if (age < 3) milestones += BONUS_AGE_3 * Math.pow(1 + r, 21 - 3);
    if (age < 13) milestones += BONUS_BAR_MITZVA * Math.pow(1 + r, 21 - 13);
    const totalGross = projGross + milestones + BONUS_AGE_21;
    const deposited = bal + monthlyDep * n21;
    const netKids = totalGross - Math.max(0, totalGross - deposited) * TAX_GEMEL;

    let netExtra = 0;
    if (extra > 0) {
      const extraGross = extra * ((Math.pow(1 + rM, n21) - 1) / rM);
      const extraDep = extra * n21;
      netExtra = extraGross - Math.max(0, extraGross - extraDep) * TAX_GEMEL;
    }

    const totalNet = netKids + netExtra;
    const gap = target > 0 ? Math.max(0, target - totalNet) : 0;
    let monthlyNeeded = 0;
    if (gap > 0 && n21 > 0 && rM > 0) {
      monthlyNeeded = Math.ceil(((gap / 0.85) * rM) / (Math.pow(1 + rM, n21) - 1));
    } else if (gap > 0 && n21 > 0) {
      monthlyNeeded = Math.ceil(gap / n21);
    }

    return {
      yearsTo21: Math.round(yearsTo21 * 10) / 10,
      totalNet: Math.round(totalNet),
      gap: Math.round(gap),
      monthlyNeeded,
      trackReturn: selectedTrack.expectedReturn,
      trackLabel: selectedTrack.label,
    };
  }, [dob, track, balance, parentDep, giftTarget, extraMonthly]);

  const handleAdd = () => {
    if (!name || !dob) return;
    onAdd({
      id: kidSavingsId(),
      childName: name,
      dob,
      provider,
      track,
      currentBalance: Number(balance) || 0,
      monthlyDeposit: GOV_MONTHLY_DEPOSIT + parentDep,
      parentDeposit: parentDep,
      giftTarget: Number(giftTarget) || 0,
      extraMonthly: Number(extraMonthly) || 0,
      extraVehicle,
    });
  };

  return (
    <div className="v-divider space-y-3 rounded-xl border-2 border-dashed bg-gray-50 p-4">
      <h4 className="flex items-center justify-end gap-2 text-right text-[13px] font-extrabold text-verdant-ink">
        <span>הוספת ילד/ה</span>
        <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
          person_add
        </span>
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            שם *
          </label>
          <input
            className="inp w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם הילד/ה"
          />
        </div>
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            תאריך לידה *
          </label>
          <input
            className="inp w-full"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            בית השקעות
          </label>
          <select
            className="inp w-full"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="">בחר...</option>
            {KIDS_PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            מסלול
          </label>
          <div className="grid grid-cols-3 gap-1">
            {KIDS_TRACKS.filter((t) => t.key !== "halacha").map((t) => (
              <button
                key={t.key}
                onClick={() => setTrack(t.key)}
                className={`rounded-lg border px-2 py-2 text-[10px] font-extrabold transition-all ${
                  track === t.key
                    ? "text-white shadow-sm"
                    : "bg-white text-verdant-ink hover:bg-gray-100"
                }`}
                style={{
                  borderColor: track === t.key ? TRACK_COLORS[t.key] : "#d8e0d0",
                  background: track === t.key ? TRACK_COLORS[t.key] : undefined,
                }}
              >
                {t.label}
                <div className="mt-0.5 text-[8px] font-bold opacity-80">
                  {(t.expectedReturn * 100).toFixed(1)}%
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            יתרה נוכחית ₪
          </label>
          <input
            className="inp w-full"
            type="number"
            min="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
            הפקדת הורים (₪{PARENT_MONTHLY_MAX}/חודש)
          </label>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                { label: "כן", value: PARENT_MONTHLY_MAX },
                { label: "לא", value: 0 },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                onClick={() => setParentDep(opt.value)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-extrabold transition-all ${
                  parentDep === opt.value
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-gray-300 bg-white text-verdant-ink hover:bg-gray-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Target + extra */}
      <div className="v-divider border-t pt-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
              יעד גיל 21 ₪
            </label>
            <input
              className="inp w-full"
              type="number"
              min="0"
              step="10000"
              value={giftTarget}
              onChange={(e) => setGiftTarget(e.target.value)}
              placeholder="300,000"
            />
          </div>
          <div>
            <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
              הפקדה נוספת ₪/חודש
            </label>
            <input
              className="inp w-full"
              type="number"
              min="0"
              value={extraMonthly}
              onChange={(e) => setExtraMonthly(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-right text-[10px] font-bold text-verdant-muted">
              כלי
            </label>
            <select
              className="inp w-full"
              value={extraVehicle}
              onChange={(e) => setExtraVehicle(e.target.value)}
            >
              <option value="gemel">קופ״ג להשקעה</option>
              <option value="broker">תיק מסחר</option>
            </select>
          </div>
        </div>

        {/* Live result */}
        {liveCalc && (
          <div
            className={`mt-3 rounded-lg border p-3 ${
              Number(giftTarget) > 0
                ? liveCalc.gap > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-green-200 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-right">
                {Number(giftTarget) > 0 ? (
                  liveCalc.gap > 0 ? (
                    <>
                      <div className="text-[12px] font-extrabold" style={{ color: "#b45309" }}>
                        חסר ~₪{liveCalc.monthlyNeeded}/חודש ליעד
                      </div>
                      <div className="text-[9px] font-bold text-verdant-muted">
                        {liveCalc.trackLabel} · {Math.round(liveCalc.yearsTo21)} שנים
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-green-700">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      היעד מושג!
                    </div>
                  )
                ) : (
                  <div className="text-[9px] font-bold text-verdant-muted">
                    {liveCalc.trackLabel} ({(liveCalc.trackReturn * 100).toFixed(1)}%) ·{" "}
                    {Math.round(liveCalc.yearsTo21)} שנים
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold text-verdant-muted">צפי נטו גיל 21</div>
                <div className="text-[15px] font-extrabold tabular-nums text-verdant-ink">
                  {fmtILS(liveCalc.totalNet)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!name || !dob}
          className="btn-botanical flex-1 px-3 py-2 text-[12px] disabled:opacity-40"
        >
          הוסף
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost px-3 py-2 text-[12px]">
          ביטול
        </button>
      </div>
    </div>
  );
}
