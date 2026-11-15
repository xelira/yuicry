"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { waveGenres } from "@/lib/genres";

type Props = {
  value: string;
  onChange: (id: string) => void;
};

type Marker = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export default function WaveGenres({ value, onChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<Marker | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const update = () => {
      const active = list.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!active) {
        setMarker(null);
        return;
      }

      const origin = list.getBoundingClientRect();
      const rect = active.getBoundingClientRect();

      setMarker({
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(list);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [value]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const active = list.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active) return;

    const origin = list.getBoundingClientRect();
    const rect = active.getBoundingClientRect();

    if (rect.left >= origin.left && rect.right <= origin.right) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    active.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [value]);

  return (
    <div className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-32px),transparent_100%)] sm:[mask-image:none]">
      <div
        ref={listRef}
        className="relative flex w-max gap-1 rounded-full bg-surface2/45 p-1 sm:w-full sm:flex-wrap sm:justify-center sm:rounded-2xl"
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

        {waveGenres.map((genre) => {
          const active = genre.id === value;

          return (
            <button
              key={genre.id || "all"}
              onClick={() => onChange(genre.id)}
              aria-pressed={active}
              className={`relative z-10 h-7 shrink-0 rounded-full px-3 text-[12px] leading-none transition-colors ${
                active ? "text-bg" : "text-muted hover:text-ink"
              }`}
            >
              {genre.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
