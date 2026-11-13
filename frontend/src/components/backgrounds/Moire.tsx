"use client";

import { levels } from "@/lib/audio";
import { alpha, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Moire({ light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const sound = levels();
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const firstX = width * 0.34;
    const firstY = height * 0.5;
    const secondX = width * 0.62 + Math.sin(time * 0.13) * width * 0.025;
    const secondY = height * 0.58 + Math.cos(time * 0.11) * height * 0.025;
    const gap = 12 + sound.bass * 1.5;
    const radius = Math.hypot(width, height) * 0.72;
    const count = Math.ceil(radius / gap);

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 0.7;

    for (let index = 1; index <= count; index += 1) {
      const distance = index * gap;

      ctx.beginPath();
      ctx.arc(firstX, firstY, distance, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ink},${light ? 0.11 : 0.1})`;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(secondX, secondY, distance, 0, Math.PI * 2);
      ctx.strokeStyle =
        index % 9 === 0
          ? alpha(accentTone, light ? 0.24 : 0.2)
          : `rgba(${ink},${light ? 0.11 : 0.1})`;
      ctx.stroke();
    }
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full animate-[fade-in_.6s_ease-out]" />;
}
