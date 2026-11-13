"use client";

import { AudioLines, Disc3, Heart, Search } from "lucide-react";

export type Tab = "wave" | "search" | "likes" | "albums";

const items: { id: Tab; label: string; icon: typeof AudioLines }[] = [
  { id: "wave", label: "Волна", icon: AudioLines },
  { id: "search", label: "Поиск", icon: Search },
  { id: "likes", label: "Избранное", icon: Heart },
  { id: "albums", label: "Альбомы", icon: Disc3 },
];

type Props = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

export default function MobileNav({ tab, onChange }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface sm:hidden">
      <div className="flex h-[58px] items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.7} />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
