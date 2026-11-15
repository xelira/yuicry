"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type Marker = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function useMarker(value: unknown) {
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

  return { listRef, marker };
}

export function useScrollIntoView(
  value: unknown,
  listRef: React.RefObject<HTMLElement | null>,
) {
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
  }, [value, listRef]);
}
