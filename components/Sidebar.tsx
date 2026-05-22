"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_SECTIONS, type NavGroup, type NavItem } from "@/lib/nav";
import { manualFactoryResetAsync } from "@/lib/factory-reset";
import { useConfirm } from "@/components/ui/ConfirmModal";

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
  const { confirm, modal } = useConfirm();

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

  const handleReset = async () => {
    const ok = await confirm({
      title: "למחוק את כל הנתונים?",
      body: "כל הנתונים של הלקוח יימחקו לצמיתות וכל הערכים יחזרו לאפס. פעולה זו אינה הפיכה.",
      confirmLabel: "כן, מחק הכל",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    // 2026-05-22 per Nir: advisor reset shouldn't sign out the advisor.
    // Pass keepAuth so Supabase session + IndexedDB auth cache survive.
    // Also clear the impersonation cookie so the advisor truly exits the
    // client's portfolio, then land them on /crm (not /dashboard, which
    // would just re-bounce them through impersonation flow).
    const { wiped, remoteDeleted } = await manualFactoryResetAsync({
      keepAuth: isAdvisor,
    });
    if (isAdvisor) {
      try {
        await fetch("/api/crm/impersonate", { method: "DELETE" });
      } catch {
        /* fall through to navigation even if cookie clear failed */
      }
    }
    try {
      // eslint-disable-next-line no-console
      console.info(
        `[manual-reset] wiped ${wiped} local keys + ${remoteDeleted} remote rows — reloading`
      );
    } catch {}
    window.location.href = isAdvisor ? "/crm" : "/login";
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
          className="relative flex items-center justify-between gap-3 rounded-xl transition-all"
          style={{
            height: "42px",
            paddingInline: indent ? "14px" : "12px",
            paddingInlineStart: indent ? "28px" : "12px",
            background: active ? "var(--morning-leaf-tint)" : "transparent",
            color: active ? "var(--morning-forest)" : "var(--morning-muted)",
          }}
          onMouseEnter={(e) => {
            if (!active) e.currentTarget.style.background = "var(--morning-surface-2)";
          }}
          onMouseLeave={(e) => {
            if (!active) e.currentTarget.style.background = "transparent";
          }}
        >
          {active && (
            <span
              aria-hidden
              className="absolute"
              style={{
                right: 0,
                top: 8,
                bottom: 8,
                width: 3,
                borderRadius: 3,
                background: "var(--morning-forest)",
              }}
            />
          )}
          <span
            className="material-symbols-outlined text-[20px]"
            style={{
              color: active ? "var(--morning-forest)" : "var(--morning-muted)",
              fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
            }}
          >
            {item.icon}
          </span>
          <span
            className="flex-1 text-right text-[14px]"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? "var(--morning-ink)" : "var(--morning-muted)",
            }}
          >
            {item.label}
          </span>
          {item.badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: active ? "var(--morning-forest)" : "var(--morning-leaf-tint)",
                color: active ? "#fff" : "var(--morning-forest)",
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
    if (!group.label) {
      return (
        <div
          key={group.id}
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid var(--morning-border)" }}
        >
          <ul className="space-y-1">{group.items.map((it) => renderItem(it, false))}</ul>
        </div>
      );
    }

    if (!group.collapsible) {
      return (
        <div key={group.id} className="mt-5">
          <div
            className="mb-2 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--morning-subtle)" }}
          >
            {group.label}
          </div>
          <ul className="space-y-1">{group.items.map((it) => renderItem(it, false))}</ul>
        </div>
      );
    }

    const open = openGroups[group.id] ?? true;
    const hasActiveChild = group.items.some((it) => isActive(it.href));
    return (
      <div key={group.id} className="mt-4">
        <button
          onClick={() => toggleGroup(group.id)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 transition-all"
          style={{
            color: hasActiveChild ? "var(--morning-ink)" : "var(--morning-muted)",
            background: "transparent",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--morning-surface-2)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-expanded={open}
        >
          {/* Category icon on the right (RTL leading edge) */}
          {group.icon && (
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ color: hasActiveChild ? "var(--morning-forest)" : "var(--morning-subtle)" }}
            >
              {group.icon}
            </span>
          )}
          <span
            className="flex-1 text-right text-[12px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: hasActiveChild ? "var(--morning-ink)" : "var(--morning-subtle)" }}
          >
            {group.label}
          </span>
          {/* Chevron on the left (trailing edge) */}
          <span
            className="material-symbols-outlined text-[18px] transition-transform"
            style={{
              color: "var(--morning-subtle)",
              transform: open ? "rotate(0deg)" : "rotate(90deg)",
            }}
          >
            expand_more
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
    <>
      {modal}
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-[280px] flex-col"
        style={{
          background: "var(--morning-surface)",
          borderLeft: "1px solid var(--morning-border)",
          color: "var(--morning-muted)",
          boxShadow: "var(--morning-shadow-card)",
        }}
      >
        {/* Brand */}
        <div className="px-6 pb-5 pt-7">
          {/* Brand — text on the right (RTL leading), leaf icon pushed to the
              left edge with justify-between so it gets breathing room and
              doesn't feel pinned to the text. */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div
                className="text-[26px] font-bold leading-tight tracking-tight lowercase"
                style={{
                  color: "var(--morning-ink)",
                  fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
                }}
              >
                plan
              </div>
              <div
                className="mt-0.5 text-[11px] font-medium"
                style={{ color: "var(--morning-muted)" }}
              >
                מערכת לתכנון פיננסי
              </div>
            </div>
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{
                background: "var(--morning-leaf-tint)",
                border: "1px solid var(--morning-leaf-soft)",
              }}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ color: "var(--morning-forest)" }}
              >
                eco
              </span>
            </div>
          </div>
        </div>

        {/* Active household */}
        <div className="px-5 pb-3">
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: "var(--morning-surface-2)",
              border: "1px solid var(--morning-border)",
            }}
          >
            <div
              className="text-right text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--morning-muted)" }}
            >
              תיק פעיל
            </div>
            <div
              className="mt-1 text-right text-[15px] font-bold"
              style={{ color: "var(--morning-ink)" }}
            >
              {familyName}
            </div>
            <div
              className="mt-0.5 text-right text-[11px]"
              style={{ color: "var(--morning-muted)" }}
            >
              {membersCount} בני משפחה
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 pb-2">
          {NAV_SECTIONS.map((g) => {
            const items = isAdvisor ? g.items : g.items.filter((it) => !it.advisorOnly);
            if (items.length === 0) return null;
            return renderGroup({ ...g, items });
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-5 py-4"
          style={{ borderTop: "1px solid var(--morning-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
              style={{
                background: "var(--morning-forest)",
                color: "#fff",
              }}
            >
              {advisorName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1 text-right">
              <div
                className="truncate text-[14px] font-semibold"
                style={{ color: "var(--morning-ink)" }}
              >
                {advisorName}
              </div>
            </div>
          </div>

          {saveStatus !== "idle" && (
            <div
              className="mt-3 flex items-center justify-center gap-2 rounded-xl py-1.5 text-[11px] font-semibold"
              style={{
                background:
                  saveStatus === "saving"
                    ? "var(--morning-surface-2)"
                    : saveStatus === "saved"
                      ? "var(--morning-success-soft)"
                      : "var(--morning-danger-soft)",
                color:
                  saveStatus === "saving"
                    ? "var(--morning-muted)"
                    : saveStatus === "saved"
                      ? "var(--morning-success)"
                      : "var(--morning-danger)",
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

          {/* Reset — advisor only. Clients never see this dangerous affordance. */}
          {isAdvisor && (
            <button
              onClick={handleReset}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all"
              style={{
                background: "transparent",
                color: "var(--morning-muted)",
                border: "1px solid var(--morning-border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--morning-danger-soft)";
                e.currentTarget.style.color = "var(--morning-danger)";
                e.currentTarget.style.borderColor = "rgba(220,38,38,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--morning-muted)";
                e.currentTarget.style.borderColor = "var(--morning-border)";
              }}
              title="מוחק את כל הנתונים של הלקוח ומחזיר את כל הערכים לאפס"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              איפוס נתוני לקוח
            </button>
          )}

          {isAdvisor && (
            <button
              onClick={async () => {
                // 1. Clear the impersonation cookie so the advisor truly exits the
                //    client's portfolio (instead of staying impersonated in the
                //    background — which makes /dashboard bounce them straight back).
                // 2. Use a hard navigation (window.location) so the (client) RSC
                //    layout re-runs with a fresh cookie state.
                try {
                  await fetch("/api/crm/impersonate", { method: "DELETE" });
                } catch {
                  /* even if the network call fails, fall through to navigation */
                }
                window.location.href = "/crm";
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all"
              style={{
                background: "var(--morning-leaf-tint)",
                color: "var(--morning-forest)",
                border: "1px solid var(--morning-leaf-soft)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--morning-leaf-soft)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--morning-leaf-tint)";
              }}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              חזרה ל-CRM
            </button>
          )}

          <button
            onClick={onExit ?? (() => router.push("/login"))}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all"
            style={{
              background: "transparent",
              color: "var(--morning-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--morning-surface-2)";
              e.currentTarget.style.color = "var(--morning-ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--morning-muted)";
            }}
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            התנתקות
          </button>
        </div>
      </aside>
    </>
  );
}
