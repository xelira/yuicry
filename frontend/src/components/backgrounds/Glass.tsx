"use client";

import { alpha, mixHex, tone, useBackgroundCanvas, wash } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Glass({ colors, light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";

    ctx.clearRect(0, 0, width, height);
    wash(ctx, width, height, colors, light);

    const target = Math.max(64, Math.min(104, width * 0.14));
    const columns = Math.max(4, Math.ceil(width / target));
    const rows = Math.max(6, Math.ceil(height / target));
    const cellWidth = width / columns;
    const cellHeight = height / rows;

    const grid: [number, number][][] = [];

    for (let row = 0; row <= rows; row += 1) {
      const line: [number, number][] = [];

      for (let column = 0; column <= columns; column += 1) {
        const edge = row === 0 || row === rows || column === 0 || column === columns;
        const wobbleX = edge ? 0 : Math.sin(column * 1.9 + row * 2.7) * cellWidth * 0.2;
        const wobbleY = edge ? 0 : Math.cos(column * 2.3 + row * 1.4) * cellHeight * 0.2;
        const driftX = edge ? 0 : Math.sin(time * 0.16 + column * 1.3 + row) * 2.2;
        const driftY = edge ? 0 : Math.cos(time * 0.13 + row * 1.7 + column) * 2.2;

        line.push([column * cellWidth + wobbleX + driftX, row * cellHeight + wobbleY + driftY]);
      }

      grid.push(line);
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const corners = [
          grid[row][column],
          grid[row][column + 1],
          grid[row + 1][column + 1],
          grid[row + 1][column],
        ];

        const pick = colors[(row * 3 + column) % colors.length];
        const tint = light ? mixHex(pick, "#ffffff", 0.45) : mixHex(pick, "#ffffff", 0.12);
        const shimmer = 0.5 + 0.5 * Math.sin(time * 0.35 + row * 0.9 + column * 1.3);
        const emphasis = row % 3 === 0 && column % 2 === 0;
        const opacity = (light ? 0.14 : 0.24) * (0.55 + shimmer * 0.7) * (emphasis ? 1.3 : 0.85);

        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);

        for (let index = 1; index < corners.length; index += 1) {
          ctx.lineTo(corners[index][0], corners[index][1]);
        }

        ctx.closePath();
        ctx.fillStyle = alpha(tint, opacity);
        ctx.fill();

        ctx.strokeStyle = `rgba(${ink},${light ? 0.16 : 0.14})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    const sweep = ctx.createLinearGradient(
      width * 0.1,
      height * 0.1,
      width * 0.9,
      height * 0.9,
    );
    const position = (Math.sin(time * 0.12) + 1) / 2;

    sweep.addColorStop(0, alpha(accentTone, 0));
    sweep.addColorStop(Math.max(0, position - 0.2), alpha(accentTone, 0));
    sweep.addColorStop(position, alpha(accentTone, light ? 0.1 : 0.13));
    sweep.addColorStop(Math.min(1, position + 0.2), alpha(accentTone, 0));
    sweep.addColorStop(1, alpha(accentTone, 0));

    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, width, height);
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
