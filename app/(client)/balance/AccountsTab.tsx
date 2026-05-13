"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  loadAccounts,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
  addCreditCard,
  updateCreditCard,
  deleteCreditCard,
  totalBankBalance,
  totalCreditCharges,
  totalCreditLimit,
  ACCOUNTS_EVENT,
  ISRAELI_BANKS,
  CREDIT_COMPANIES,
  type BankAccount,
  type CreditCard,
  type AccountsData,
} from "@/lib/accounts-store";

const fmtILS = (n: number) => `₪${n.toLocaleString("he-IL")}`;
const today = () => new Date().toISOString().split("T")[0];

/** Days from today until the next occurrence of `day` of the month.
 *  Returns 0 if today === day. Loops to next month if the day already passed. */
function daysUntilBillingDay(day: number): number {
  if (!day || day < 1 || day > 31) return 0;
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();
  const monthLen = new Date(thisYear, thisMonth + 1, 0).getDate();
  const clamped = Math.min(day, monthLen);
  const target = new Date(thisYear, thisMonth, clamped);
  if (target < new Date(thisYear, thisMonth, now.getDate())) {
    const nextMonthLen = new Date(thisYear, thisMonth + 2, 0).getDate();
    target.setMonth(thisMonth + 1);
    target.setDate(Math.min(day, nextMonthLen));
  }
  return Math.max(
    0,
    Math.round(
      (target.getTime() - new Date(thisYear, thisMonth, now.getDate()).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );
}

export function AccountsTab() {
  const [data, setData] = useState<AccountsData>({ banks: [], creditCards: [] });
  const [addingBank, setAddingBank] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Card id currently in "+הוסף עסקה" quick-add mode.
  const [quickAddId, setQuickAddId] = useState<string | null>(null);

  const reload = useCallback(() => setData(loadAccounts()), []);
  useEffect(() => {
    reload();
    window.addEventListener(ACCOUNTS_EVENT, reload);
    return () => window.removeEventListener(ACCOUNTS_EVENT, reload);
  }, [reload]);

  const bankTotal = useMemo(() => totalBankBalance(data), [data]);
  const creditTotal = useMemo(() => totalCreditCharges(data), [data]);
  const totalLimit = useMemo(() => totalCreditLimit(data), [data]);
  const netLiquid = bankTotal - creditTotal;

  /* ── Bank handlers ── */
  const handleAddBank = (bank: Omit<BankAccount, "id">) => {
    addBankAccount(bank);
    setAddingBank(false);
    reload();
  };

  const handleDeleteBank = (id: string) => {
    deleteBankAccount(id);
    setEditingId(null);
    reload();
  };

  const handleUpdateBank = (id: string, patch: Partial<BankAccount>) => {
    updateBankAccount(id, patch);
    setEditingId(null);
    reload();
  };

  /* ── Card handlers ── */
  const handleAddCard = (card: Omit<CreditCard, "id">) => {
    addCreditCard(card);
    setAddingCard(false);
    reload();
  };

  const handleDeleteCard = (id: string) => {
    deleteCreditCard(id);
    setEditingId(null);
    reload();
  };

  const handleUpdateCard = (id: string, patch: Partial<CreditCard>) => {
    updateCreditCard(id, patch);
    setEditingId(null);
    reload();
  };

  return (
    <div className="space-y-6">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPI icon="account_balance" label="יתרה בנקאית" value={fmtILS(bankTotal)} color="#1B4332" />
        <KPI icon="credit_card" label="חיובי אשראי" value={fmtILS(creditTotal)} color="#f59e0b" />
        <KPI
          icon="savings"
          label="נזילות נטו"
          value={fmtILS(netLiquid)}
          color={netLiquid >= 0 ? "#1B4332" : "#b91c1c"}
        />
        <KPI
          icon="account_balance_wallet"
          label="סה״כ מסגרות"
          value={fmtILS(totalLimit)}
          color="#6366f1"
        />
      </div>

      {/* ── Bank Accounts ── */}
      <section className="v-card overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--verdant-border)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ color: "var(--verdant-emerald)" }}
            >
              account_balance
            </span>
            <h2 className="text-sm font-extrabold" style={{ color: "var(--verdant-ink)" }}>
              חשבונות בנק
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ background: "#f4f7ed", color: "var(--verdant-muted)" }}
            >
              {data.banks.length}
            </span>
          </div>
          <button
            onClick={() => setAddingBank(true)}
            className="btn-botanical flex items-center gap-1 px-4 py-2 text-xs"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>הוסף חשבון
          </button>
        </div>

        {addingBank && <BankForm onSave={handleAddBank} onCancel={() => setAddingBank(false)} />}

        {data.banks.length === 0 && !addingBank && (
          <div className="p-8 text-center">
            <span
              className="material-symbols-outlined mb-2 block text-[40px]"
              style={{ color: "var(--verdant-muted)" }}
            >
              account_balance
            </span>
            <div className="text-sm font-bold" style={{ color: "var(--verdant-muted)" }}>
              אין חשבונות בנק
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--verdant-muted)" }}>
              הוסף את חשבונות הבנק שלך כדי לעקוב אחר היתרות
            </div>
          </div>
        )}

        {data.banks.map((bank) => (
          <div key={bank.id}>
            {editingId === bank.id ? (
              <BankForm
                initial={bank}
                onSave={(b) => handleUpdateBank(bank.id, b)}
                onCancel={() => setEditingId(null)}
                onDelete={() => handleDeleteBank(bank.id)}
              />
            ) : (
              <div
                className="flex cursor-pointer items-center gap-4 border-b px-5 py-4 transition-colors hover:bg-gray-50/40"
                style={{ borderColor: "var(--verdant-border)" }}
                onClick={() => setEditingId(bank.id)}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "#1B433215" }}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ color: "#1B4332" }}
                  >
                    account_balance
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-extrabold"
                      style={{ color: "var(--verdant-ink)" }}
                    >
                      {bank.bankName}
                    </span>
                    {bank.isMain && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{ background: "#1B433215", color: "#1B4332" }}
                      >
                        ראשי
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--verdant-muted)" }}>
                    חשבון {bank.accountNumber} · סניף {bank.branchNumber}
                  </div>
                </div>
                {(bank.creditLimit ?? 0) > 0 && (
                  <div className="max-w-[160px] flex-1">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
                      <span style={{ color: "var(--verdant-muted)" }}>ניצול מסגרת</span>
                      <span
                        style={{
                          color:
                            bank.balance < 0 && bank.creditLimit! > 0
                              ? Math.abs(bank.balance) / bank.creditLimit! > 0.8
                                ? "#b91c1c"
                                : "var(--verdant-muted)"
                              : "var(--verdant-muted)",
                        }}
                      >
                        {bank.balance < 0
                          ? `${Math.round((Math.abs(bank.balance) / bank.creditLimit!) * 100)}%`
                          : "0%"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width:
                            bank.balance < 0
                              ? `${Math.min(100, (Math.abs(bank.balance) / bank.creditLimit!) * 100)}%`
                              : "0%",
                          background:
                            bank.balance < 0 && Math.abs(bank.balance) / bank.creditLimit! > 0.8
                              ? "#ef4444"
                              : "#6366f1",
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="text-left">
                  <div
                    className="tabular text-base font-extrabold"
                    style={{ color: bank.balance >= 0 ? "#1B4332" : "#b91c1c" }}
                  >
                    {fmtILS(bank.balance)}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--verdant-muted)" }}>
                    {(bank.creditLimit ?? 0) > 0
                      ? `מסגרת: ${fmtILS(bank.creditLimit!)}`
                      : `עודכן: ${bank.lastUpdated}`}
                  </div>
                </div>
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ color: "var(--verdant-muted)" }}
                >
                  edit
                </span>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── Credit Cards ── */}
      <section className="v-card overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--verdant-border)" }}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#f59e0b" }}>
              credit_card
            </span>
            <h2 className="text-sm font-extrabold" style={{ color: "var(--verdant-ink)" }}>
              כרטיסי אשראי
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ background: "#fef3c7", color: "#92400e" }}
            >
              {data.creditCards.length}
            </span>
          </div>
          <button
            onClick={() => setAddingCard(true)}
            className="btn-botanical flex items-center gap-1 px-4 py-2 text-xs"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>הוסף כרטיס
          </button>
        </div>

        {addingCard && (
          <CardForm
            banks={data.banks}
            onSave={handleAddCard}
            onCancel={() => setAddingCard(false)}
          />
        )}

        {data.creditCards.length === 0 && !addingCard && (
          <div className="p-8 text-center">
            <span
              className="material-symbols-outlined mb-2 block text-[40px]"
              style={{ color: "var(--verdant-muted)" }}
            >
              credit_card
            </span>
            <div className="text-sm font-bold" style={{ color: "var(--verdant-muted)" }}>
              אין כרטיסי אשראי
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--verdant-muted)" }}>
              הוסף את כרטיסי האשראי שלך כדי לעקוב אחר חיובים
            </div>
          </div>
        )}

        {data.creditCards.map((card) => {
          const daysLeft = daysUntilBillingDay(card.billingDay);
          return (
          <div key={card.id}>
            {editingId === card.id ? (
              <CardForm
                banks={data.banks}
                initial={card}
                onSave={(c) => handleUpdateCard(card.id, c)}
                onCancel={() => setEditingId(null)}
                onDelete={() => handleDeleteCard(card.id)}
              />
            ) : (
              <>
              <div
                className="flex items-center gap-4 border-b px-5 py-4 transition-colors hover:bg-gray-50/40"
                style={{ borderColor: "var(--verdant-border)" }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "#f59e0b15" }}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ color: "#f59e0b" }}
                  >
                    credit_card
                  </span>
                </div>
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => setEditingId(card.id)}
                >
                  <div className="text-sm font-extrabold" style={{ color: "var(--verdant-ink)" }}>
                    {card.company}
                  </div>
                  <div className="text-xs" style={{ color: "var(--verdant-muted)" }}>
                    •••• {card.lastFourDigits} · יום חיוב: {card.billingDay} ·{" "}
                    <span
                      style={{
                        color: daysLeft <= 3 ? "#b91c1c" : daysLeft <= 7 ? "#b45309" : "var(--verdant-muted)",
                        fontWeight: daysLeft <= 7 ? 700 : 500,
                      }}
                    >
                      {daysLeft === 0 ? "היום!" : `${daysLeft} ימים נותרו`}
                    </span>
                  </div>
                </div>
                <div className="max-w-[200px] flex-1">
                  {/* Charge vs limit bar */}
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
                    <span style={{ color: "var(--verdant-muted)" }}>ניצול מסגרת</span>
                    <span
                      style={{
                        color:
                          card.creditLimit > 0
                            ? card.currentCharge / card.creditLimit > 0.8
                              ? "#b91c1c"
                              : "var(--verdant-muted)"
                            : "var(--verdant-muted)",
                      }}
                    >
                      {card.creditLimit > 0
                        ? `${Math.round((card.currentCharge / card.creditLimit) * 100)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width:
                          card.creditLimit > 0
                            ? `${Math.min(100, (card.currentCharge / card.creditLimit) * 100)}%`
                            : "0%",
                        background:
                          card.creditLimit > 0 && card.currentCharge / card.creditLimit > 0.8
                            ? "#ef4444"
                            : "#f59e0b",
                      }}
                    />
                  </div>
                </div>
                <div className="text-left">
                  <div className="tabular text-base font-extrabold" style={{ color: "#b45309" }}>
                    {fmtILS(card.currentCharge)}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--verdant-muted)" }}>
                    מסגרת: {fmtILS(card.creditLimit)}
                  </div>
                </div>
                <button
                  onClick={() => setQuickAddId(quickAddId === card.id ? null : card.id)}
                  title="הוסף עסקה לסל"
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-green-50"
                  style={{
                    background: quickAddId === card.id ? "#C1ECD4" : "#eef7f1",
                    color: "#1B4332",
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {quickAddId === card.id ? "close" : "add"}
                  </span>
                </button>
                <button
                  onClick={() => setEditingId(card.id)}
                  title="ערוך פרטי כרטיס"
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
                >
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={{ color: "var(--verdant-muted)" }}
                  >
                    edit
                  </span>
                </button>
              </div>
              {/* Inline quick-add: bumps currentCharge in one click, appends a
                  trace to notes. The "סל מצטבר" UX from Nir's Excel — record
                  a purchase as it happens, see the basket grow, know what'll
                  hit the bank on charge day. (2026-05-13 stage 3.) */}
              {quickAddId === card.id && (
                <QuickAddPurchase
                  card={card}
                  onCancel={() => setQuickAddId(null)}
                  onAdd={(amount, description) => {
                    const trace = description
                      ? `${new Date().toLocaleDateString("he-IL")}: ${description} +${amount}`
                      : `${new Date().toLocaleDateString("he-IL")}: +${amount}`;
                    const newNotes = card.notes ? `${card.notes}\n${trace}` : trace;
                    handleUpdateCard(card.id, {
                      currentCharge: (card.currentCharge || 0) + amount,
                      notes: newNotes,
                      lastUpdated: today(),
                    });
                    setQuickAddId(null);
                  }}
                />
              )}
              </>
            )}
          </div>
          );
        })}
      </section>
    </div>
  );
}

/* ── KPI Card ── */
function KPI({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="card-pad flex flex-col items-center gap-1">
      <span className="material-symbols-outlined text-[24px]" style={{ color }}>
        {icon}
      </span>
      <div className="tabular text-xl font-extrabold" style={{ color: "var(--verdant-ink)" }}>
        {value}
      </div>
      <div className="text-xs font-bold" style={{ color: "var(--verdant-muted)" }}>
        {label}
      </div>
    </div>
  );
}

/* ── Bank Form ── */
function BankForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: BankAccount;
  onSave: (b: Omit<BankAccount, "id">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [bankName, setBankName] = useState(initial?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber || "");
  const [branchNumber, setBranchNumber] = useState(initial?.branchNumber || "");
  const [balance, setBalance] = useState(initial?.balance?.toString() || "");
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit?.toString() || "");
  const [isMain, setIsMain] = useState(initial?.isMain || false);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [accountType, setAccountType] = useState<"private" | "business">(
    initial?.accountType || "private"
  );

  return (
    <div
      className="border-b px-5 py-4"
      style={{ background: "#fafbfc", borderColor: "var(--verdant-border)" }}
    >
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            בנק
          </label>
          <select
            className="v-input w-full text-sm"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          >
            <option value="">בחר בנק...</option>
            {ISRAELI_BANKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            מספר חשבון
          </label>
          <input
            className="v-input w-full text-sm"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="123456"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            סניף
          </label>
          <input
            className="v-input w-full text-sm"
            value={branchNumber}
            onChange={(e) => setBranchNumber(e.target.value)}
            placeholder="001"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            יתרה ₪
          </label>
          <input
            type="number"
            className="v-input w-full text-sm"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            מסגרת ₪
          </label>
          <input
            type="number"
            className="v-input w-full text-sm"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            הערות
          </label>
          <input
            className="v-input w-full text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            סוג חשבון
          </label>
          <select
            className="v-input w-full text-sm"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as "private" | "business")}
          >
            <option value="private">פרטי</option>
            <option value="business">עסקי</option>
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isMain}
              onChange={(e) => setIsMain(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs font-bold" style={{ color: "var(--verdant-ink)" }}>
              חשבון ראשי
            </span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            onSave({
              bankName,
              accountNumber,
              branchNumber,
              balance: parseFloat(balance) || 0,
              creditLimit: parseFloat(creditLimit) || 0,
              lastUpdated: today(),
              isMain,
              notes,
              accountType,
            })
          }
          disabled={!bankName}
          className="btn-botanical px-4 py-2 text-xs disabled:opacity-40"
        >
          {initial ? "עדכן" : "הוסף"}
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost px-3 py-2 text-xs">
          ביטול
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="mr-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>מחק
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Quick-add purchase: inline mini-form that bumps currentCharge by N₪. ── */
function QuickAddPurchase({
  card,
  onAdd,
  onCancel,
}: {
  card: CreditCard;
  onAdd: (amount: number, description: string) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    onAdd(n, description.trim());
  };

  const projectedAfter = (card.currentCharge || 0) + (parseFloat(amount) || 0);
  const utilPct =
    card.creditLimit > 0 ? Math.round((projectedAfter / card.creditLimit) * 100) : 0;

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b px-5 py-3"
      style={{ background: "#f9faf2", borderColor: "var(--verdant-border)" }}
    >
      <span className="text-[12px] font-bold" style={{ color: "#1B4332" }}>
        הוסף לסל:
      </span>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="סכום"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        className="w-24 rounded-md border bg-white px-2 py-1.5 text-center text-[13px] font-extrabold tabular-nums focus:outline-none"
        style={{ borderColor: "#d8e0d0" }}
        dir="ltr"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="לדוגמה: סופר, דלק, מתנה"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        className="min-w-[140px] flex-1 rounded-md border bg-white px-2 py-1.5 text-[12px] focus:outline-none"
        style={{ borderColor: "#d8e0d0" }}
      />
      {parseFloat(amount) > 0 && card.creditLimit > 0 && (
        <span
          className="text-[11px] font-bold"
          style={{ color: utilPct >= 80 ? "#b91c1c" : "#1B4332" }}
        >
          → {fmtILS(projectedAfter)} ({utilPct}%)
        </span>
      )}
      <button
        onClick={submit}
        disabled={!parseFloat(amount)}
        className="btn-botanical !px-4 !py-1.5 text-[12px] disabled:opacity-40"
      >
        שמור
      </button>
      <button
        onClick={onCancel}
        className="text-[11px] font-bold text-verdant-muted hover:underline"
      >
        ביטול
      </button>
    </div>
  );
}

/* ── Credit Card Form ── */
function CardForm({
  initial,
  banks,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: CreditCard;
  banks: BankAccount[];
  onSave: (c: Omit<CreditCard, "id">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [company, setCompany] = useState(initial?.company || "");
  const [lastFour, setLastFour] = useState(initial?.lastFourDigits || "");
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit?.toString() || "");
  const [currentCharge, setCurrentCharge] = useState(initial?.currentCharge?.toString() || "");
  const [billingDay, setBillingDay] = useState(initial?.billingDay?.toString() || "10");
  const [linkedBankId, setLinkedBankId] = useState(initial?.linkedBankId || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  return (
    <div
      className="border-b px-5 py-4"
      style={{ background: "#fafbfc", borderColor: "var(--verdant-border)" }}
    >
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            חברת אשראי
          </label>
          <select
            className="v-input w-full text-sm"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">בחר חברה...</option>
            {CREDIT_COMPANIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            4 ספרות אחרונות
          </label>
          <input
            className="v-input w-full text-sm"
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value)}
            maxLength={4}
            placeholder="1234"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            מסגרת ₪
          </label>
          <input
            type="number"
            className="v-input w-full text-sm"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            חיוב נוכחי ₪
          </label>
          <input
            type="number"
            className="v-input w-full text-sm"
            value={currentCharge}
            onChange={(e) => setCurrentCharge(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            יום חיוב
          </label>
          <input
            type="number"
            min={1}
            max={28}
            className="v-input w-full text-sm"
            value={billingDay}
            onChange={(e) => setBillingDay(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-bold"
            style={{ color: "var(--verdant-muted)" }}
          >
            מקושר לחשבון
          </label>
          <select
            className="v-input w-full text-sm"
            value={linkedBankId}
            onChange={(e) => setLinkedBankId(e.target.value)}
          >
            <option value="">ללא</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bankName} · {b.accountNumber}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            onSave({
              company,
              lastFourDigits: lastFour,
              creditLimit: parseFloat(creditLimit) || 0,
              currentCharge: parseFloat(currentCharge) || 0,
              billingDay: parseInt(billingDay) || 10,
              linkedBankId,
              lastUpdated: today(),
              notes,
            })
          }
          disabled={!company}
          className="btn-botanical px-4 py-2 text-xs disabled:opacity-40"
        >
          {initial ? "עדכן" : "הוסף"}
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost px-3 py-2 text-xs">
          ביטול
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="mr-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>מחק
          </button>
        )}
      </div>
    </div>
  );
}
