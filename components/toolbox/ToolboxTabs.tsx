"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  tabs: Tab[];
  children: Record<string, ReactNode>;
}

export function ToolboxTabs({ tabs, children }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div>
      {/* Tab bar */}
      <div className="v-divider mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
              active === t.id
                ? "border-botanical-forest bg-botanical-forest text-botanical-cream"
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
