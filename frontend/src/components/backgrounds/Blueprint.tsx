"use client";

import { levels } from "@/lib/audio";
import { alpha, grainTexture, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Blueprint({ light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const sound = levels();
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const line = `rgba(${ink},${light ? 0.15 : 0.12})`;
    const faint = `rgba(${ink},${light ? 0.07 : 0.06})`;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const base = Math.min(width, height);
    const tick = 6;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = line;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    for (let x = cx % 42; x < width; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, cy - tick);
      ctx.lineTo(x, cy + tick);
      ctx.stroke();
    }

    for (let y = cy % 42; y < height; y += 42) {
      ctx.beginPath();
      ctx.moveTo(cx - tick, y);
      ctx.lineTo(cx + tick, y);
      ctx.stroke();
    }

    [0.18, 0.3, 0.42, 0.54].forEach((radius, index) => {
      const value = base * radius * (1 + (index === 2 ? sound.bass * 0.012 : 0));

      ctx.beginPath();
      ctx.arc(cx, cy, value, 0, Math.PI * 2);
      ctx.strokeStyle = index === 2 ? alpha(accentTone, light ? 0.3 : 0.34) : line;
      ctx.lineWidth = index === 2 ? 1.2 : 0.8;
      ctx.stroke();
    });

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.08);
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, base * 0.36, 0, Math.PI * 2);
    ctx.strokeStyle = faint;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(-base * 0.62, 0);
    ctx.lineTo(base * 0.62, 0);
    ctx.strokeStyle = faint;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    const start = -0.9 + time * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, base * 0.42, start, start + 1.15);
    ctx.strokeStyle = alpha(accentTone, light ? 0.42 : 0.52);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const scanX = ((time * 0.045) % 1) * width;
    ctx.beginPath();
    ctx.moveTo(scanX, 0);
    ctx.lineTo(scanX, height);
    ctx.strokeStyle = alpha(accentTone, light ? 0.07 : 0.06);
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
        style={{ backgroundImage: grainTexture, backgroundSize: "140px 140px" }}
      />
    </div>
  );
}
