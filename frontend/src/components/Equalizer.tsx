"use client";

import { useEffect, useRef } from "react";

import { levels } from "@/lib/audio";

type Props = {
  active: boolean;
};

export default function Equalizer({ active }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      const holder = ref.current;

      if (holder) {
        const sound = levels();
        const values = active ? [sound.bass * 0.45, sound.mid, sound.treble] : [0.18, 0.18, 0.18];

        for (let i = 0; i < holder.children.length; i += 1) {
          const bar = holder.children[i] as HTMLElement;
          const value = Math.max(0.16, Math.min(1, values[i] * 1.5 + 0.05));
          bar.style.height = `${Math.round(value * 100)}%`;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <span ref={ref} className="flex h-5 items-end gap-[2px]">
      <span className="w-[3px] rounded-sm bg-white" style={{ height: "20%" }} />
      <span className="w-[3px] rounded-sm bg-white" style={{ height: "20%" }} />
      <span className="w-[3px] rounded-sm bg-white" style={{ height: "20%" }} />
    </span>
  );
}
