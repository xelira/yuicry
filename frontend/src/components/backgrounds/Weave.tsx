"use client";

import { levels } from "@/lib/audio";
import { alpha, grainTexture, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Weave({ light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const sound = levels();
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const gap = 8;
    const shift = (time * 5 + sound.bass * 6) % gap;

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 0.65;

    for (let offset = -height; offset < width + height; offset += gap) {
      const x = offset + shift;
      const accentThread = Math.round(offset / gap) % 14 === 0;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - height, height);
      ctx.strokeStyle = accentThread
        ? alpha(accentTone, light ? 0.26 : 0.22)
        : `rgba(${ink},${light ? 0.13 : 0.11})`;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.strokeStyle = `rgba(${ink},${light ? 0.1 : 0.09})`;
      ctx.stroke();
    }

    const sweep = ctx.createLinearGradient(0, 0, width, height);
    const position = (time * 0.025) % 1;
    sweep.addColorStop(0, "transparent");
    sweep.addColorStop(Math.max(0, position - 0.16), "transparent");
    sweep.addColorStop(position, light ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.09)");
    sweep.addColorStop(Math.min(1, position + 0.16), "transparent");
    sweep.addColorStop(1, "transparent");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, width, height);
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: grainTexture, backgroundSize: "140px 140px" }}
      />
    </div>
  );
}
