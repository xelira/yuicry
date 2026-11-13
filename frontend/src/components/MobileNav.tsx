"use client";

import { AudioWaveform, Heart, Library, Search } from "lucide-react";

export type Tab = "wave" | "search" | "likes" | "albums";

const items: { id: Tab; label: string; icon: typeof AudioWaveform }[] = [
  { id: "wave", label: "Волна", icon: AudioWaveform },
  { id: "search", label: "Поиск", icon: Search },
  { id: "likes", label: "Избранное", icon: Heart },
  { id: "albums", label: "Плейлисты", icon: Library },
];

type Props = {
  tab: Tab;
  onChange: (tab: Tab) => void;
  compact?: boolean;
};

export default function MobileNav({ tab, onChange, compact = false }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[var(--inset-bottom,0px)] sm:hidden">
      <div className={`flex items-stretch ${compact ? "h-[46px]" : "h-[58px]"}`}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex flex-1 flex-col items-center justify-center transition-colors ${compact ? "text-[9px]" : "gap-1.5 pt-1 text-[10px]"} ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon size={compact ? 19 : 20} strokeWidth={1.8} />
              {!compact && item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
