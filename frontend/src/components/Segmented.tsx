"use client";

import type { ReactNode } from "react";

import { useMarker } from "@/lib/useMarker";

type Option<T> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type Props<T> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
};

export default function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className = "",
}: Props<T>) {
  const { listRef, marker } = useMarker(value);

  return (
    <div
      ref={listRef}
      className={`relative flex gap-0.5 rounded-full bg-surface2/45 p-1 ${className}`}
    >
      {marker && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-ink transition-[left,top,width,height] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
          style={{
            left: marker.left,
            top: marker.top,
            width: marker.width,
            height: marker.height,
          }}
        />
      )}

      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`relative z-10 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] transition-colors ${
              active ? "text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
