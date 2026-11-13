"use client";

import { levels } from "@/lib/audio";
import { alpha, grainTexture, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Halftone({ light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const sound = levels();
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const gap = 15;
    const phase = time * 0.32;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.PI / 10);
    ctx.translate(-width / 2, -height / 2);

    ctx.clearRect(0, 0, width, height);

    for (let y = -height * 0.2; y < height * 1.2; y += gap) {
      for (let x = -width * 0.2; x < width * 1.2; x += gap) {
        const nx = x / width;
        const ny = y / height;
        const wave =
          Math.sin(nx * 7.5 + phase) * Math.cos(ny * 6.2 - phase * 0.7) +
          Math.sin((nx + ny) * 4.6 - phase * 0.4) * 0.35;
        const level = Math.max(0, Math.min(1, 0.5 + 0.5 * wave));
        const edge = Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) * 1.45);
        const size =
          gap *
          0.5 *
          (0.06 + level * 0.65) *
          (0.55 + edge * 0.2) *
          (1 + sound.bass * 0.06);
        const px = x + Math.sin(time * 0.3 + ny * 5) * 1.2;
        const py = y + Math.cos(time * 0.25 + nx * 5) * 1.2;

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle =
          level > 0.72
            ? alpha(accentTone, light ? 0.24 : 0.22)
            : `rgba(${ink},${light ? 0.12 : 0.11})`;
        ctx.fill();
      }
    }

    ctx.restore();
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
