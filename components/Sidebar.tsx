"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_CLIENT } from "@/lib/nav";

interface SidebarProps {
  familyName: string;
  membersCount: number;
  advisorName: string;
  onExit?: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
}

export function Sidebar({ familyName, membersCount, advisorName, onExit, saveStatus = "idle" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      className="fixed inset-y-0 right-0 w-[280px] flex flex-col text-white z-40"
      style={{ background: "#012d1d" }}
    >
      {/* Brand */}
      <div className="px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-baseline justify-end gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold">
            Verdant
          </span>
          <span className="text-xl font-extrabold">plan</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mt-1 text-right">
          Wealth Management
        </div>
      </div>

      {/* Active household */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-[0.15em] text-white/50 font-bold text-right">
          תיק פעיל
        </div>
        <div className="text-base font-extrabold mt-1 text-right">{familyName}</div>
        <div className="text-[11px] text-white/50 mt-0.5 text-right">
          {membersCount} בני משפחה
        </div>
      </div>

      {/* Nav items — Plan-Based client journey */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-2 px-3 text-right">
          תחנות הליווי
        </div>
        <ul className="space-y-0.5">
          {NAV_CLIENT.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <li key={item.id}>
                <Link
                  href={item.href as any}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    active
                      ? "bg-verdant-accent/30 text-white"
                      : "text-white/75 hover:bg-white/5 hover:text-white"
                  }`}
                  style={active ? { boxShadow: "inset 2px 0 0 #10b981" } : undefined}
                >
                  <span className="material-symbols-outlined text-[20px] opacity-70">
                    {item.icon}
                  </span>
                  <span className="text-sm font-bold flex-1 text-right">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Advisor footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-verdant-accent flex items-center justify-center text-sm font-bold">
            {advisorName.charAt(0)}
          </div>
          <div className="flex-1 text-right">
            <div className="text-sm font-bold">{advisorName}</div>
            <div className="text-[10px] text-white/50">מתכנן אחראי</div>
          </div>
        </div>

        {/* Save Status */}
        {saveStatus !== "idle" && (
          <div className="mb-3 flex items-center justify-center gap-2 text-[11px] font-bold py-1.5 rounded-lg" style={{
            background: saveStatus === "saving" ? "rgba(255,255,255,0.05)" : saveStatus === "saved" ? "rgba(16,185,129,0.15)" : "rgba(185,28,28,0.15)",
            color: saveStatus === "saving" ? "rgba(255,255,255,0.5)" : saveStatus === "saved" ? "#10b981" : "#f87171",
          }}>
            <span className={`material-symbols-outlined text-[14px] ${saveStatus === "saving" ? "animate-pulse" : ""}`}>
              {saveStatus === "saving" ? "cloud_sync" : saveStatus === "saved" ? "cloud_done" : "cloud_off"}
            </span>
            {saveStatus === "saving" ? "שומר..." : saveStatus === "saved" ? "נשמר" : "שגיאה"}
          </div>
        )}

        {/* Back to CRM */}
        <button
          onClick={() => router.push("/crm")}
          className="mt-3 w-full px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          חזרה ל-CRM
        </button>

        {/* Divider + Logout */}
        <div className="mt-2 pt-2 border-t border-white/10">
          <button
            onClick={onExit ?? (() => router.push("/login"))}
            className="w-full px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            התנתקות
          </button>
        </div>
      </div>
    </aside>
  );
}
