"use client";

/**
 * Top-of-page banner shown while the advisor is viewing a client's screens.
 * Informational only — the "חזור ל-CRM" action lives in the sidebar to avoid
 * duplication. Reading data works normally (advisor owns the household's data
 * via RLS); editing is left enabled so the advisor can help fill the onboarding.
 */

export function ImpersonationBanner({ familyName }: { familyName: string }) {
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-40 flex items-center gap-2 px-4 py-2 text-[13px] font-bold"
      style={{
        background: "linear-gradient(90deg, #012D1D, #1B4332)",
        color: "#F9FAF2",
      }}
    >
      <span className="material-symbols-outlined text-[18px]">visibility</span>
      <span>אתה צופה כלקוח: <span className="font-extrabold">{familyName}</span></span>
      <span className="opacity-75 text-[11px] font-medium">— כל שינוי יישמר במשק הבית של הלקוח</span>
    </div>
  );
}
