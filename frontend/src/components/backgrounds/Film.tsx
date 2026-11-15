"use client";

import { alpha, grainTexture, tone, useBackgroundCanvas, wash } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Film({ colors, light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const base = Math.min(width, height);

    ctx.clearRect(0, 0, width, height);
    wash(ctx, width, height, colors, light);

    const leak = ctx.createRadialGradient(
      width * 0.94,
      height * 0.16,
      0,
      width * 0.94,
      height * 0.16,
      base * 1.2,
    );
    leak.addColorStop(0, alpha(accentTone, light ? 0.16 : 0.24));
    leak.addColorStop(0.5, alpha(accentTone, light ? 0.05 : 0.08));
    leak.addColorStop(1, alpha(accentTone, 0));

    ctx.fillStyle = leak;
    ctx.fillRect(0, 0, width, height);

    const holeWidth = width * 0.042;
    const holeHeight = holeWidth * 1.45;
    const pitch = holeHeight * 2.55;
    const drift = (time * 12) % pitch;
    const margin = width * 0.028;

    const perforate = (x: number) => {
      for (let y = -pitch; y < height + pitch; y += pitch) {
        ctx.beginPath();

        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y + drift, holeWidth, holeHeight, holeWidth * 0.28);
        } else {
          ctx.rect(x, y + drift, holeWidth, holeHeight);
        }

        ctx.fill();
      }
    };

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
    perforate(margin);
    perforate(width - margin - holeWidth);
    ctx.restore();

    const frameLeft = margin + holeWidth + width * 0.018;
    const frameRight = width - margin - holeWidth - width * 0.018;

    ctx.strokeStyle = `rgba(${ink},${light ? 0.13 : 0.11})`;
    ctx.lineWidth = 1;

    [frameLeft, frameRight].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    for (let index = 0; index < 3; index += 1) {
      const x = width * (0.24 + index * 0.26) + Math.sin(time * 0.25 + index * 2) * 4;

      ctx.strokeStyle = `rgba(${ink},${light ? 0.06 : 0.05})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + Math.sin(time * 0.18 + index * 1.4) * 7, height);
      ctx.stroke();
    }
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: grainTexture, backgroundSize: "160px 160px" }}
      />
    </div>
  );
}
