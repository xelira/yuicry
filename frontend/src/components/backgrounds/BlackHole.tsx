"use client";

import { alpha, mixHex, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function BlackHole({ light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const accentTone = light ? tone(accent, true) : accent;
    const base = Math.min(width, height);
    const cx = width * 0.5;
    const cy = height * 0.63;
    const radius = base * 0.19;
    const tilt = -0.16;
    const flatten = 0.33;
    const inner = 1.85;
    const outer = 5.0;
    const spin = time * 0.2;

    const hot = light ? mixHex("#fff8ee", accent, 0.18) : "#fff8ee";
    const warm = light ? accent : accentTone;
    const deep = mixHex(warm, "#170409", light ? 0.78 : 0.86);

    ctx.clearRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 6);
    glow.addColorStop(0, alpha(warm, light ? 0.24 : 0.4));
    glow.addColorStop(0.4, alpha(warm, light ? 0.1 : 0.16));
    glow.addColorStop(1, alpha(warm, 0));

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    if (!light) {
      for (let index = 0; index < 90; index += 1) {
        const x = (index * 137.51) % width;
        const y = (index * 71.93) % (height * 0.86);
        const flicker = 0.5 + 0.5 * Math.sin(time * 0.5 + index * 1.7);
        const size = index % 11 === 0 ? 1.6 : 1;

        ctx.fillStyle = `rgba(255,255,255,${0.06 + flicker * 0.2})`;
        ctx.fillRect(x, y, size, size);
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(1, flatten);

    const disk = ctx.createRadialGradient(0, 0, radius * inner, 0, 0, radius * outer);
    disk.addColorStop(0, alpha(hot, light ? 0.98 : 1));
    disk.addColorStop(0.2, alpha(warm, light ? 0.9 : 1));
    disk.addColorStop(0.5, alpha(mixHex(warm, deep, 0.42), light ? 0.7 : 0.82));
    disk.addColorStop(0.78, alpha(deep, light ? 0.42 : 0.52));
    disk.addColorStop(1, alpha(deep, 0));

    ctx.beginPath();
    ctx.arc(0, 0, radius * outer, 0, Math.PI * 2);
    ctx.arc(0, 0, radius * inner, 0, Math.PI * 2, true);
    ctx.fillStyle = disk;
    ctx.fill("evenodd");

    for (let index = 0; index < 54; index += 1) {
      const t = index / 54;
      const orbit = radius * (inner + t * (outer - inner));
      const start = (index * 2.399 + spin * (0.6 + (index % 3) * 0.22)) % (Math.PI * 2);
      const length = 0.55 + (index % 5) * 0.24;
      const fade = Math.pow(1 - t, 1.5);

      ctx.strokeStyle = alpha(mixHex(hot, warm, t), fade * (light ? 0.42 : 0.62));
      ctx.lineWidth = Math.max(1.2, radius * 0.024);
      ctx.beginPath();
      ctx.arc(0, 0, orbit, start, start + length);
      ctx.stroke();
    }

    ctx.strokeStyle = alpha(hot, light ? 0.85 : 1);
    ctx.lineWidth = Math.max(1.2, radius * 0.026);
    ctx.beginPath();
    ctx.arc(0, 0, radius * inner, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    const arcStart = Math.PI * 1.04;
    const arcEnd = Math.PI * 1.96;
    const segments = 46;

    for (let index = 0; index < segments; index += 1) {
      const from = arcStart + ((arcEnd - arcStart) * index) / segments;
      const to = arcStart + ((arcEnd - arcStart) * (index + 1)) / segments;
      const fade = Math.pow(Math.sin((Math.PI * (index + 0.5)) / segments), 0.55);

      ctx.strokeStyle = alpha(mixHex(hot, warm, index / segments), (light ? 0.8 : 1) * fade);
      ctx.lineWidth = Math.max(1.5, radius * 0.055);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.19, from, to);
      ctx.stroke();
    }

    ctx.strokeStyle = alpha(warm, light ? 0.16 : 0.22);
    ctx.lineWidth = Math.max(1, radius * 0.03);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.19, 0, Math.PI * 2);
    ctx.stroke();

    for (let index = 0; index < 52; index += 1) {
      const phase = time * (0.16 + (index % 6) * 0.022) + index * 1.61;
      const drift = (((index / 52 + time * 0.01) % 1) + 1) % 1;
      const orbit = radius * (inner + drift * (outer - inner) * 0.85);
      const x = cx + Math.cos(phase) * orbit;
      const y = cy + Math.sin(phase) * orbit * flatten;
      const fade = Math.pow(1 - drift, 1.3);

      ctx.fillStyle = alpha(hot, fade * (light ? 0.45 : 0.8));
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, radius * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }

    if (light) {
      const shade = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.75);
      shade.addColorStop(0, "rgba(12,8,8,0.16)");
      shade.addColorStop(0.55, "rgba(12,8,8,0.06)");
      shade.addColorStop(1, "rgba(12,8,8,0)");

      ctx.fillStyle = shade;
      ctx.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 4);
    }

    const core = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    core.addColorStop(0, "#000000");
    core.addColorStop(0.88, "#000000");
    core.addColorStop(1, light ? "#08080b" : "#010103");

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = alpha(hot, 1);
    ctx.lineWidth = Math.max(1.6, radius * 0.026);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.03, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = alpha(hot, light ? 0.2 : 0.3);
    ctx.lineWidth = Math.max(7, radius * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.03, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(1, flatten);

    const band = ctx.createRadialGradient(
      0,
      0,
      radius * inner,
      0,
      0,
      radius * inner * 1.24,
    );
    band.addColorStop(0, alpha(hot, light ? 0.9 : 1));
    band.addColorStop(0.55, alpha(warm, light ? 0.7 : 1));
    band.addColorStop(1, alpha(warm, 0));

    const bandSegments = 26;

    for (let index = 0; index < bandSegments; index += 1) {
      const from = (Math.PI * index) / bandSegments;
      const to = (Math.PI * (index + 1)) / bandSegments;
      const fade = Math.pow(Math.sin((Math.PI * (index + 0.5)) / bandSegments), 1.15);

      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(0, 0, radius * inner * 1.24, from, to);
      ctx.arc(0, 0, radius * inner, to, from, true);
      ctx.closePath();
      ctx.fillStyle = band;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
