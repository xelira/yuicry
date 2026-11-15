"use client";

import { alpha, tone, useBackgroundCanvas, wash } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Field({ colors, light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const base = Math.min(width, height);

    ctx.clearRect(0, 0, width, height);
    wash(ctx, width, height, colors, light);

    const ax = width * 0.34 + Math.sin(time * 0.11) * width * 0.022;
    const ay = height * 0.45 + Math.cos(time * 0.09) * height * 0.016;
    const bx = width * 0.66 + Math.cos(time * 0.13) * width * 0.022;
    const by = height * 0.57 + Math.sin(time * 0.1) * height * 0.016;

    const force = (x: number, y: number) => {
      const dx1 = x - ax;
      const dy1 = y - ay;
      const dx2 = x - bx;
      const dy2 = y - by;
      const d1 = Math.pow(Math.max(6, Math.hypot(dx1, dy1)), 3);
      const d2 = Math.pow(Math.max(6, Math.hypot(dx2, dy2)), 3);

      return [dx1 / d1 - dx2 / d2, dy1 / d1 - dy2 / d2];
    };

    const step = base * 0.007;
    const lines = 30;

    for (let index = 0; index < lines; index += 1) {
      const angle = (index / lines) * Math.PI * 2 + time * 0.01;
      const seed = base * 0.03;
      let x = ax + Math.cos(angle) * seed;
      let y = ay + Math.sin(angle) * seed;

      ctx.beginPath();
      ctx.moveTo(x, y);

      for (let stride = 0; stride < 300; stride += 1) {
        const [fx, fy] = force(x, y);
        const length = Math.hypot(fx, fy) || 1;

        x += (fx / length) * step;
        y += (fy / length) * step;

        if (x < -60 || x > width + 60 || y < -60 || y > height + 60) break;
        if (Math.hypot(x - bx, y - by) < base * 0.012) break;

        ctx.lineTo(x, y);
      }

      const highlight = index % 7 === 0;

      ctx.strokeStyle = highlight
        ? alpha(accentTone, light ? 0.3 : 0.28)
        : `rgba(${ink},${light ? 0.11 : 0.1})`;
      ctx.lineWidth = highlight ? 1.2 : 0.8;
      ctx.stroke();
    }

    [
      [ax, ay],
      [bx, by],
    ].forEach(([x, y]) => {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, base * 0.14);
      halo.addColorStop(0, alpha(accentTone, light ? 0.24 : 0.3));
      halo.addColorStop(1, alpha(accentTone, 0));

      ctx.fillStyle = halo;
      ctx.fillRect(x - base * 0.14, y - base * 0.14, base * 0.28, base * 0.28);

      ctx.fillStyle = alpha(accentTone, light ? 0.5 : 0.6);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.4, base * 0.006), 0, Math.PI * 2);
      ctx.fill();
    });
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
