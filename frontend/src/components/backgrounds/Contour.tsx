"use client";

import { useRef } from "react";

import { levels } from "@/lib/audio";
import { alpha, grainTexture, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

type Props = {
  colors: Palette;
  light?: boolean;
};

function createNoise(size: number) {
  const data = new Float32Array(size * size);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random();
  }

  return data;
}

function sampleNoise(data: Float32Array, size: number, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const wrap = (value: number) => ((value % size) + size) % size;
  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);
  const a = data[y0 * size + x0];
  const b = data[y0 * size + x1];
  const c = data[y1 * size + x0];
  const d = data[y1 * size + x1];

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export default function Contour({ light = false }: Props) {
  const accent = useAccentColor();
  const table = useRef<Float32Array | null>(null);

  if (!table.current) {
    table.current = createNoise(128);
  }

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const sound = levels();
    const accentTone = light ? tone(accent, true) : accent;
    const ink = light ? "24,24,32" : "244,244,252";
    const cell = 44;
    const cols = Math.ceil(width / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;
    const drift = time * 0.025;
    const field: number[][] = [];

    for (let row = 0; row < rows; row += 1) {
      const values: number[] = [];

      for (let column = 0; column < cols; column += 1) {
        const x = column * 0.045 + drift;
        const y = row * 0.045 - drift * 0.6;
        const value =
          sampleNoise(table.current!, 128, x * 8, y * 8) * 0.76 +
          sampleNoise(table.current!, 128, x * 17 + 41, y * 17 - 23) * 0.24;

        values.push(value);
      }

      field.push(values);
    }

    ctx.clearRect(0, 0, width, height);

    const count = 4;

    for (let index = 1; index <= count; index += 1) {
      const level = index / (count + 1);
      const highlighted = index === 2;
      const scale = 1 + sound.bass * 0.015;

      ctx.beginPath();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < cols - 1; column += 1) {
          const topLeft = field[row][column] * scale;
          const topRight = field[row][column + 1] * scale;
          const bottomRight = field[row + 1][column + 1] * scale;
          const bottomLeft = field[row + 1][column] * scale;
          const x = column * cell;
          const y = row * cell;
          const points: [number, number][] = [];

          if ((topLeft - level) * (topRight - level) < 0) {
            points.push([x + cell * ((level - topLeft) / (topRight - topLeft)), y]);
          }

          if ((topRight - level) * (bottomRight - level) < 0) {
            points.push([x + cell, y + cell * ((level - topRight) / (bottomRight - topRight))]);
          }

          if ((bottomRight - level) * (bottomLeft - level) < 0) {
            points.push([x + cell * ((level - bottomLeft) / (bottomRight - bottomLeft)), y + cell]);
          }

          if ((bottomLeft - level) * (topLeft - level) < 0) {
            points.push([x, y + cell * ((level - topLeft) / (bottomLeft - topLeft))]);
          }

          if (points.length === 2) {
            ctx.moveTo(points[0][0], points[0][1]);
            ctx.lineTo(points[1][0], points[1][1]);
          } else if (points.length === 4) {
            ctx.moveTo(points[0][0], points[0][1]);
            ctx.lineTo(points[1][0], points[1][1]);
            ctx.moveTo(points[2][0], points[2][1]);
            ctx.lineTo(points[3][0], points[3][1]);
          }
        }
      }

      ctx.strokeStyle = highlighted
        ? alpha(accentTone, light ? 0.34 : 0.42)
        : `rgba(${ink},${light ? 0.13 : 0.11})`;
      ctx.lineWidth = highlighted ? 1.3 : 0.9;
      ctx.stroke();
    }
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{ backgroundImage: grainTexture, backgroundSize: "140px 140px" }}
      />
    </div>
  );
}
