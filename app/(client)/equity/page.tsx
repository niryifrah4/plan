"use client";

/**
 * Equity — RSU / ESPP / Options tracker with §102 tax.
 *
 * Lets the user add grants, tracks vesting progression, and computes
 * net value after §102 capital-gains tax if sold today.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import {
  loadGrants,
  saveGrants,
  computeVested,
  summarizePortfolio,
  type EquityGrant,
  type EquityType,
} from "@/lib/equity-store";

const uid = () => "g" + Math.random().toString(36).slice(2, 10);

const TYPE_LABELS: Record<EquityType, string> = {
  rsu: "RSU",
  espp: "ESPP",
  options: "אופציות",
};

export default function EquityPage() {
  const [grants, setGrants] = useState<EquityGrant[]>([]);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState<EquityGrant | null>(null);

  useEffect(() => {
    setGrants(loadGrants());
    setMounted(true);
  }, []);

  const summary = useMemo(() => summarizePortfolio(grants), [grants]);

  const upsertGrant = (g: EquityGrant) => {
    setGrants((prev) => {
      const exists = prev.some((x) => x.id === g.id);
      const next = exists ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g];
      saveGrants(next);
      return next;
    });
    setEditing(null);
  };

  const deleteGrant = (id: string) => {
    if (!confirm("למחוק את ההקצאה?")) return;
    setGrants((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveGrants(next);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-4xl" dir="rtl">
      {/* ═══ Hero ═══ */}
      <section
        className="mb-5 overflow-hidden rounded-3xl"
        style={{
          background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
          color: "#F9FAF2",
          padding: "28px 32px",
        }}
      >
        <div
          className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          שווי נטו אחרי מס
        </div>
        <div
          className="text-center text-[56px] font-extrabold tabular-nums leading-none"
          style={{ color: "#F9FAF2", fontFamily: "Manrope, Assistant, system-ui, sans-serif" }}
        >
          {grants.length > 0 ? fmtILS(summary.totalNetAfterTaxIls) : "—"}
        </div>
        {grants.length > 0 && (
          <div
            className="mt-3 text-center text-[13px] font-semibold"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            שווי תיק{" "}
            <span className="font-extrabold tabular-nums">
              {fmtILS(summary.totalPortfolioValueIls)}
            </span>
            {"  "}·{"  "}
            מס צפוי{" "}
            <span className="font-extrabold tabular-nums">
              {fmtILS(summary.totalTaxOwedIfSoldIls)}
            </span>
          </div>
        )}
      </section>

      {/* ═══ KPI row ═══ */}
      {mounted && grants.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <KpiCard
            label="הבשיל עד היום"
            value={fmtILS(summary.totalVestedValueIls)}
            tone="emerald"
          />
          <KpiCard
            label="עדיין לא הבשיל"
            value={fmtILS(summary.totalUnvestedValueIls)}
            tone="muted"
          />
        </div>
      )}

      {/* ═══ Add button ═══ */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-extrabold" style={{ color: "#012d1d" }}>
          הקצאות ({grants.length})
        </h2>
        <button
          onClick={() => setEditing(makeNewGrant())}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-extrabold transition-all"
          style={{ background: "#1B4332", color: "#fff" }}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          הוסף הקצאה
        </button>
      </div>

      {/* ═══ Grants list ═══ */}
      {mounted && grants.length === 0 && (
        <div
          className="rounded-2xl bg-white p-8 text-center"
          style={{ border: "1px dashed #c8d6c0" }}
        >
          <span className="material-symbols-outlined text-[40px]" style={{ color: "#9fb3a4" }}>
            inventory
          </span>
          <div className="mt-2 text-[14px] font-bold" style={{ color: "#012d1d" }}>
            אין הקצאות מניות
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "#5a7a6a" }}>
            עובדים בהייטק? עקוב כאן אחרי RSU/ESPP עם מס 102.
          </div>
        </div>
      )}

      <div className="space-y-3">
        {grants.map((g) => (
          <GrantCard
            key={g.id}
            grant={g}
            onEdit={() => setEditing(g)}
            onDelete={() => deleteGrant(g.id)}
          />
        ))}
      </div>

      {/* ═══ Edit modal ═══ */}
      {editing && (
        <GrantEditor grant={editing} onSave={upsertGrant} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

function makeNewGrant(): EquityGrant {
  return {
    id: uid(),
    company: "",
    ticker: "",
    type: "rsu",
    totalShares: 0,
    grantPricePerShare: 0,
    currentPricePerShare: 0,
    vestStart: new Date().toISOString().slice(0, 10),
    vestMonths: 48,
    cliffMonths: 12,
    frequency: "quarterly",
    currency: "USD",
    usdIlsRate: 3.7,
  };
}

/* ═══════════════════════════════════════════════════════════
   KpiCard
   ═══════════════════════════════════════════════════════════ */
function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "muted";
}) {
  const color = tone === "emerald" ? "#1B4332" : "#5a7a6a";
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid #e2e8d8" }}>
      <div
        className="text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "#5a7a6a" }}
      >
        {label}
      </div>
      <div className="mt-1 text-[20px] font-extrabold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GrantCard
   ═══════════════════════════════════════════════════════════ */
function GrantCard({
  grant,
  onEdit,
  onDelete,
}: {
  grant: EquityGrant;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const v = computeVested(grant);
  return (
    <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid #e2e8d8" }}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-extrabold" style={{ color: "#012d1d" }}>
              {grant.company || "ללא שם"}
            </span>
            {grant.ticker && (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-extrabold"
                style={{ background: "#f0f4ec", color: "#1B4332" }}
              >
                {grant.ticker}
              </span>
            )}
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "#1B4332", color: "#fff" }}
            >
              {TYPE_LABELS[grant.type]}
            </span>
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: "#5a7a6a" }}>
            {grant.totalShares.toLocaleString()} מניות · vesting מ-{grant.vestStart} ·{" "}
            {grant.vestMonths} חודשים
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded-lg p-1.5 hover:bg-[#f0f4ec]" title="ערוך">
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#5a7a6a" }}>
              edit
            </span>
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 hover:bg-[#fef2f2]" title="מחק">
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#b91c1c" }}>
              delete
            </span>
          </button>
        </div>
      </div>

      {/* Vesting progress bar */}
      <div className="mb-3">
        <div
          className="mb-1 flex items-center justify-between text-[11px] font-bold"
          style={{ color: "#5a7a6a" }}
        >
          <span>התקדמות הבשלה</span>
          <span className="tabular-nums">
            {(v.vestedPct * 100).toFixed(0)}% ({v.vestedShares.toLocaleString()} מ-
            {grant.totalShares.toLocaleString()})
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#eef2e8" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${v.vestedPct * 100}%`, background: "#2B694D" }}
          />
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="הבשיל" value={fmtILS(v.vestedValueIls)} color="#1B4332" />
        <StatBox label="מס §102 (25%)" value={fmtILS(v.taxIls)} color="#b45309" />
        <StatBox label="נטו אם נמכר היום" value={fmtILS(v.netAfterTaxIls)} color="#012d1d" bold />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "#9fb3a4" }}
      >
        {label}
      </div>
      <div
        className={`mt-0.5 text-[13px] tabular-nums ${bold ? "font-extrabold" : "font-bold"}`}
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GrantEditor (modal)
   ═══════════════════════════════════════════════════════════ */
function GrantEditor({
  grant,
  onSave,
  onCancel,
}: {
  grant: EquityGrant;
  onSave: (g: EquityGrant) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EquityGrant>(grant);
  const update = <K extends keyof EquityGrant>(k: K, v: EquityGrant[K]) =>
    setDraft((p) => ({ ...p, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(1,45,29,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-[17px] font-extrabold" style={{ color: "#012d1d" }}>
          {grant.company ? "עריכת הקצאה" : "הקצאה חדשה"}
        </h3>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <TextField label="חברה" value={draft.company} onChange={(v) => update("company", v)} />
          <TextField
            label="סימבול (AAPL)"
            value={draft.ticker || ""}
            onChange={(v) => update("ticker", v)}
          />

          <SelectField
            label="סוג"
            value={draft.type}
            onChange={(v) => update("type", v as EquityType)}
            options={[
              { value: "rsu", label: "RSU" },
              { value: "espp", label: "ESPP" },
              { value: "options", label: "אופציות" },
            ]}
          />
          <NumberField
            label="מספר מניות סה״כ"
            value={draft.totalShares}
            onChange={(v) => update("totalShares", v)}
          />

          <NumberField
            label="מחיר ההענקה למניה"
            value={draft.grantPricePerShare}
            onChange={(v) => update("grantPricePerShare", v)}
            step={0.01}
          />
          <NumberField
            label="מחיר נוכחי למניה"
            value={draft.currentPricePerShare}
            onChange={(v) => update("currentPricePerShare", v)}
            step={0.01}
          />

          <SelectField
            label="מטבע"
            value={draft.currency}
            onChange={(v) => update("currency", v as "USD" | "ILS")}
            options={[
              { value: "USD", label: "USD" },
              { value: "ILS", label: "ILS" },
            ]}
          />
          <NumberField
            label="שער USD→ILS"
            value={draft.usdIlsRate}
            onChange={(v) => update("usdIlsRate", v)}
            step={0.01}
          />

          <TextField
            label="תחילת vesting"
            value={draft.vestStart}
            onChange={(v) => update("vestStart", v)}
            type="date"
          />
          <SelectField
            label="תדירות"
            value={draft.frequency}
            onChange={(v) => update("frequency", v as "monthly" | "quarterly")}
            options={[
              { value: "monthly", label: "חודשית" },
              { value: "quarterly", label: "רבעונית" },
            ]}
          />

          <NumberField
            label="סה״כ חודשי vesting"
            value={draft.vestMonths}
            onChange={(v) => update("vestMonths", v)}
          />
          <NumberField
            label="Cliff (חודשים)"
            value={draft.cliffMonths}
            onChange={(v) => update("cliffMonths", v)}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-[13px] font-bold"
            style={{ background: "#f0f4ec", color: "#5a7a6a" }}
          >
            ביטול
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-full px-4 py-2 text-[13px] font-extrabold"
            style={{ background: "#1B4332", color: "#fff" }}
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border bg-[#fafbf7] px-3 py-2 text-[13px] font-bold outline-none"
        style={{ borderColor: "#e2e8d8", color: "#012d1d" }}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
        {label}
      </div>
      <input
        type="number"
        dir="ltr"
        value={value || ""}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-xl border bg-[#fafbf7] px-3 py-2 text-left text-[13px] font-bold tabular-nums outline-none"
        style={{ borderColor: "#e2e8d8", color: "#012d1d" }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border bg-[#fafbf7] px-3 py-2 text-[13px] font-bold outline-none"
        style={{ borderColor: "#e2e8d8", color: "#012d1d" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
