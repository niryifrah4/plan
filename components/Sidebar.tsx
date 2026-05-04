"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_SECTIONS, type NavGroup, type NavItem } from "@/lib/nav";
import { manualFactoryResetAsync } from "@/lib/factory-reset";

interface SidebarProps {
  familyName: string;
  membersCount: number;
  advisorName: string;
  onExit?: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  /** True when the logged-in user owns this advisor practice (vs. is a
   *  client of one). Hides advisor-only affordances when false. */
  isAdvisor?: boolean;
}

const GROUPS_STORAGE_KEY = "verdant:nav:groups";

/** Read open/closed state per group id from localStorage. */
function loadGroupState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGroupState(state: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function Sidebar({
  familyName,
  membersCount,
  advisorName,
  onExit,
  saveStatus = "idle",
  isAdvisor = false,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Group open/closed state, hydrated from localStorage after mount
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const g of NAV_SECTIONS) {
      if (g.collapsible) defaults[g.id] = g.defaultOpen ?? true;
    }
    return defaults;
  });

  useEffect(() => {
    const stored = loadGroupState();
    setOpenGroups((prev) => {
      const merged = { ...prev };
      for (const g of NAV_SECTIONS) {
        if (g.collapsible && stored[g.id] !== undefined) merged[g.id] = stored[g.id];
      }
      return merged;
    });
  }, []);

  // Auto-open a group if the active route is inside it (so user doesn't land on a collapsed group)
  useEffect(() => {
    if (!pathname) return;
    for (const g of NAV_SECTIONS) {
      if (!g.collapsible) continue;
      const hasActive = g.items.some(
        (it) => pathname === it.href || pathname.startsWith(it.href + "/")
      );
      if (hasActive && !openGroups[g.id]) {
        setOpenGroups((prev) => {
          const next = { ...prev, [g.id]: true };
          saveGroupState(next);
          return next;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const [resetStage, setResetStage] = useState<"idle" | "confirm">("idle");
  useEffect(() => {
    if (resetStage !== "confirm") return;
    const t = setTimeout(() => setResetStage("idle"), 4000);
    return () => clearTimeout(t);
  }, [resetStage]);

  const handleReset = async () => {
    if (resetStage === "idle") {
      setResetStage("confirm");
      return;
    }
    // 2026-04-29: await the async path so the remote-blob wipe + Supabase
    // signOut finish BEFORE we reload. Otherwise the bootstrap re-pulls
    // the deleted-but-not-yet-deleted state and the user sees ghost data.
    const { wiped, remoteDeleted } = await manualFactoryResetAsync();
    try {
      // eslint-disable-next-line no-console
      console.info(
        `[manual-reset] wiped ${wiped} local keys + ${remoteDeleted} remote rows — reloading`
      );
    } catch {}
    window.location.href = "/dashboard";
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveGroupState(next);
      return next;
    });
  };

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  const renderItem = (item: NavItem, indent = false) => {
    const active = isActive(item.href);
    return (
      <li key={item.id}>
        <Link
          href={item.href as any}
          className="relative flex items-center justify-between gap-3 rounded-2xl transition-all"
          style={{
            height: "46px",
            paddingInline: indent ? "14px" : "12px",
            paddingInlineStart: indent ? "28px" : "12px",
            background: active ? "rgba(255,255,255,0.08)" : "transparent",
            color: active ? "#F9FAF2" : "#A8C5B1",
          }}
          onMouseEnter={(e) => {
            if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          }}
          onMouseLeave={(e) => {
            if (!active) e.currentTarget.style.background = "transparent";
          }}
        >
          {/* Active right-side bar (RTL: right edge) */}
          {active && (
            <span
              aria-hidden
              className="absolute"
              style={{
                right: 0,
                top: 10,
                bottom: 10,
                width: 3,
                borderRadius: 3,
                background: "#C1ECD4",
              }}
            />
          )}
          <span
            className="material-symbols-outlined text-[20px]"
            style={{
              color: active ? "#C1ECD4" : "#7FA68D",
              fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
            }}
          >
            {item.icon}
          </span>
          <span
            className="flex-1 text-right text-[14px]"
            style={{
              fontWeight: active ? 700 : 500,
              color: active ? "#F9FAF2" : "#A8C5B1",
            }}
          >
            {item.label}
          </span>
          {item.badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: active ? "#C1ECD4" : "rgba(168,197,177,0.15)",
                color: active ? "#012D1D" : "#A8C5B1",
              }}
            >
              {item.badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const renderGroup = (group: NavGroup) => {
    // Flat group (no header) — just render items
    // 2026-04-28: visual separator above + same indent as items in
    // collapsible groups so the row aligns with the rest of the rail.
    if (!group.label) {
      return (
        <div
          key={group.id}
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid rgba(168,197,177,0.12)" }}
        >
          <ul className="space-y-1">{group.items.map((it) => renderItem(it, false))}</ul>
        </div>
      );
    }

    // Non-collapsible labeled group (legacy fallback)
    if (!group.collapsible) {
      return (
        <div key={group.id} className="mt-5">
          <div
            className="mb-2 px-3 text-right text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "rgba(168,197,177,0.6)" }}
          >
            {group.label}
          </div>
          <ul className="space-y-1">{group.items.map((it) => renderItem(it, false))}</ul>
        </div>
      );
    }

    // Collapsible group
    const open = openGroups[group.id] ?? true;
    const hasActiveChild = group.items.some((it) => isActive(it.href));
    return (
      <div key={group.id} className="mt-4">
        <button
          onClick={() => toggleGroup(group.id)}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 transition-all"
          style={{
            color: hasActiveChild ? "#F9FAF2" : "#A8C5B1",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-expanded={open}
        >
          <span
            className="material-symbols-outlined text-[18px] transition-transform"
            style={{
              color: "#7FA68D",
              transform: open ? "rotate(0deg)" : "rotate(90deg)",
            }}
          >
            expand_more
          </span>
          <span className="flex flex-1 items-center justify-end gap-2">
            <span
              className="text-right text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: hasActiveChild ? "#F9FAF2" : "rgba(168,197,177,0.7)" }}
            >
              {group.label}
            </span>
            {group.icon && (
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ color: hasActiveChild ? "#C1ECD4" : "#7FA68D" }}
              >
                {group.icon}
              </span>
            )}
          </span>
        </button>
        <div
          style={{
            display: "grid",
            gridTemplateRows: open ? "1fr" : "0fr",
            transition: "grid-template-rows 200ms ease",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <ul className="mt-1 space-y-1">{group.items.map((it) => renderItem(it, true))}</ul>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[280px] flex-col"
      style={{
        background: "#012D1D",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        color: "#A8C5B1",
      }}
    >
      {/* Brand */}
      <div className="px-6 pb-5 pt-7">
        <div className="flex items-center justify-start gap-3">
          <div className="text-right">
            <div
              className="text-[20px] font-extrabold leading-tight tracking-tight"
              style={{ color: "#F9FAF2", fontFamily: "Manrope, Assistant, system-ui, sans-serif" }}
            >
              פלאן
            </div>
            <div className="mt-0.5 text-[11px] font-bold" style={{ color: "#A8C5B1" }}>
              מערכת לתכנון פיננסי
            </div>
          </div>
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "rgba(193,236,212,0.12)" }}
          >
            <span className="material-symbols-outlined text-[22px]" style={{ color: "#C1ECD4" }}>
              potted_plant
            </span>
          </div>
        </div>
      </div>

      {/* Active household */}
      <div className="px-6 pb-3">
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="text-right text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "rgba(168,197,177,0.6)" }}
          >
            תיק פעיל
          </div>
          <div className="mt-1 text-right text-[15px] font-extrabold" style={{ color: "#F9FAF2" }}>
            {familyName}
          </div>
          <div className="mt-0.5 text-right text-[11px]" style={{ color: "#A8C5B1" }}>
            {membersCount} בני משפחה
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 pb-2">
        {NAV_SECTIONS.map((g) => renderGroup(g))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold"
            style={{ background: "#C1ECD4", color: "#012D1D" }}
          >
            {advisorName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="truncate text-[14px] font-bold" style={{ color: "#F9FAF2" }}>
              {advisorName}
            </div>
            <div className="text-[11px]" style={{ color: "#A8C5B1" }}>
              מתכנן אחראי
            </div>
          </div>
        </div>

        {saveStatus !== "idle" && (
          <div
            className="mt-3 flex items-center justify-center gap-2 rounded-xl py-1.5 text-[11px] font-bold"
            style={{
              background:
                saveStatus === "saving"
                  ? "rgba(92,96,88,0.08)"
                  : saveStatus === "saved"
                    ? "rgba(27,67,50,0.08)"
                    : "rgba(185,28,28,0.08)",
              color:
                saveStatus === "saving"
                  ? "#5C6058"
                  : saveStatus === "saved"
                    ? "#1B4332"
                    : "#b91c1c",
            }}
          >
            <span
              className={`material-symbols-outlined text-[14px] ${
                saveStatus === "saving" ? "animate-pulse" : ""
              }`}
            >
              {saveStatus === "saving"
                ? "cloud_sync"
                : saveStatus === "saved"
                  ? "cloud_done"
                  : "cloud_off"}
            </span>
            {saveStatus === "saving" ? "שומר..." : saveStatus === "saved" ? "נשמר" : "שגיאה"}
          </div>
        )}

        <button
          onClick={handleReset}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-bold transition-all"
          style={{
            background: resetStage === "confirm" ? "#b91c1c" : "rgba(239,68,68,0.12)",
            color: resetStage === "confirm" ? "#F9FAF2" : "#FCA5A5",
            border:
              resetStage === "confirm" ? "1px solid #b91c1c" : "1px solid rgba(239,68,68,0.25)",
          }}
          title="מוחק את כל הנתונים של הלקוח ומחזיר את כל הערכים לאפס"
        >
          <span className="material-symbols-outlined text-[16px]">
            {resetStage === "confirm" ? "warning" : "restart_alt"}
          </span>
          {resetStage === "confirm" ? "לחץ שוב לאישור סופי" : "איפוס מלא לאפס"}
        </button>

        {/* "חזרה ל-CRM" — advisor-only. Clients never see this affordance. */}
        {isAdvisor && (
          <button
            onClick={() => router.push("/crm")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-bold transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "#F9FAF2",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          >
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            חזרה ל-CRM
          </button>
        )}

        <button
          onClick={onExit ?? (() => router.push("/login"))}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-bold transition-all"
          style={{ background: "transparent", color: "#A8C5B1" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(239,68,68,0.12)";
            e.currentTarget.style.color = "#FCA5A5";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#A8C5B1";
          }}
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          התנתקות
        </button>
      </div>
    </aside>
  );
}
