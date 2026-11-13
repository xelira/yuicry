"use client";

import { useEffect, useRef } from "react";

import { hexToRgb, rgbToHex } from "@/lib/color";
import type { Palette } from "@/lib/palette";

export const grainTexture =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export type BackgroundDraw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) => void;

export function mixHex(a: string, b: string, amount: number) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);

  if (!first || !second) return a;

  return rgbToHex(
    first.r + (second.r - first.r) * amount,
    first.g + (second.g - first.g) * amount,
    first.b + (second.b - first.b) * amount,
  );
}

export function alpha(hex: string, value: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,255,255,${value})`;

  return `rgba(${rgb.r},${rgb.g},${rgb.b},${value})`;
}

export function tone(hex: string, light: boolean) {
  return light ? mixHex(hex, "#ffffff", 0.35) : mixHex(hex, "#ffffff", 0.14);
}

export function paletteTones(colors: Palette, light: boolean) {
  return colors.map((color) => tone(color, light));
}

export function useBackgroundCanvas(draw: BackgroundDraw) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let frame = 0;
    let running = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const render = (now: number) => {
      if (!running) return;

      drawRef.current(ctx, width, height, (now - started) / 1000);

      if (!reduced) frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    resize();
    frame = requestAnimationFrame(render);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
        return;
      }

      if (!reduced) {
        running = true;
        frame = requestAnimationFrame(render);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return canvasRef;
}
