"use client";

import { useState, type ReactNode } from "react";

interface Tab { id: string; label: string; icon: string; }

interface Props {
  tabs: Tab[];
  children: Record<string, ReactNode>;
}

export function ToolboxTabs({ tabs, children }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b v-divider mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              active === t.id
                ? "border-verdant-accent text-verdant-accent"
                : "border-transparent text-verdant-muted hover:text-verdant-ink"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div>{children[active]}</div>
    </div>
  );
}
