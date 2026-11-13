"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Heart, Pipette, Play, RotateCcw } from "lucide-react";

import {
  accentFromHex,
  applyAccent,
  currentAccent,
  hexToHsv,
  hsvToHex,
  readAccent,
  type Hsv,
} from "@/lib/color";

const presets = [
  "#ff5a36",
  "#f5a524",
  "#a3e635",
  "#10b981",
  "#14b8a6",
  "#38bdf8",
  "#4f7cff",
  "#6366f1",
  "#a855f7",
  "#e879f9",
  "#fb7185",
  "#f5f5f5",
];

type EyeDropperInstance = {
  open: () => Promise<{ sRGBHex: string }>;
};

type EyeDropperConstructor = new () => EyeDropperInstance;

function defaultColor() {
  if (typeof document === "undefined") return "#ff5a36";
  return document.documentElement.dataset.theme === "light" ? "#dc431f" : "#ff5a36";
}

export default function AccentPicker() {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(defaultColor()));
  const [copied, setCopied] = useState(false);
  const [canPick, setCanPick] = useState(false);
  const square = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = readAccent();
    setHsv(hexToHsv(saved?.color ?? currentAccent()));
    setCanPick(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const tone = accentFromHex(hex);

  const apply = (next: Hsv) => {
    setHsv(next);
    applyAccent(accentFromHex(hsvToHex(next.h, next.s, next.v)));
  };

  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = square.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const s = Math.min(Math.max(((event.clientX - rect.left) / rect.width) * 100, 0), 100);
    const v = Math.min(Math.max(100 - ((event.clientY - rect.top) / rect.height) * 100, 0), 100);

    apply({ ...hsv, s, v });
  };

  const reset = () => {
    applyAccent(null);
    setHsv(hexToHsv(defaultColor()));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      return;
    }
  };

  const pickScreen = async () => {
    const Constructor = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!Constructor) return;

    try {
      const result = await new Constructor().open();
      const next = hexToHsv(result.sRGBHex);
      setHsv(next);
      applyAccent(accentFromHex(result.sRGBHex));
    } catch (error) {
      return;
    }
  };

  return (
    <div className="mt-5">
      <div className="relative overflow-hidden rounded-[26px] border border-line bg-surface2/80 p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background: `radial-gradient(120% 100% at 15% 0%, ${hex}55, transparent 62%)`,
          }}
        />
        <div
          className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full opacity-30 blur-3xl"
          style={{ background: hex }}
        />

        <div className="relative flex items-center gap-3">
          <span
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg"
            style={{ background: hex, color: tone.text }}
          >
            <Play size={18} fill="currentColor" className="ml-0.5" />
            <span className="absolute inset-0 rounded-full ring-1 ring-white/30" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">Твой акцент</p>
            <p className="truncate text-[11px] text-muted">Кнопки, сердце и прогресс</p>
          </div>

          <Heart size={20} fill="currentColor" style={{ color: hex }} />
        </div>

        <div className="relative mt-4 h-1.5 rounded-full bg-line">
          <div className="h-full w-[62%] rounded-full" style={{ background: hex }} />
          <span
            className="absolute left-[62%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg shadow-lg"
            style={{ background: hex }}
          />
        </div>

        <div className="relative mt-1.5 flex justify-between text-[10px] tabular-nums text-muted">
          <span>1:24</span>
          <span>3:08</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-[12px] font-medium">Оттенок и насыщенность</p>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{hex}</span>
      </div>

      <div
        ref={square}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) pick(event);
        }}
        className="relative mt-2 h-48 w-full cursor-crosshair touch-none overflow-hidden rounded-[24px] border border-line shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
      >
        <span
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35),0_6px_18px_rgba(0,0,0,0.35)]"
          style={{
            left: `clamp(12px, ${hsv.s}%, calc(100% - 12px))`,
            top: `clamp(12px, ${100 - hsv.v}%, calc(100% - 12px))`,
            background: hex,
          }}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={360}
          value={hsv.h}
          onChange={(event) => apply({ ...hsv, h: Number(event.target.value) })}
          aria-label="Оттенок"
          className="accent-hue flex-1"
          style={{ "--hue-color": `hsl(${hsv.h} 100% 50%)` } as CSSProperties}
        />
        <span className="w-9 text-right font-mono text-[10px] text-muted">{hsv.h}°</span>
      </div>

      <p className="mt-5 text-[10px] uppercase tracking-[0.14em] text-muted">Палитра</p>

      <div className="mt-2.5 grid grid-cols-6 gap-2.5">
        {presets.map((color) => {
          const active = color.toLowerCase() === hex.toLowerCase();
          const presetTone = accentFromHex(color);

          return (
            <button
              key={color}
              onClick={() => {
                const next = hexToHsv(color);
                setHsv(next);
                applyAccent(accentFromHex(color));
              }}
              aria-label={color}
              aria-pressed={active}
              className={`flex h-9 w-9 items-center justify-center justify-self-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_16px_-10px_rgba(0,0,0,0.8)] transition-transform duration-200 hover:scale-110 ${
                active ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""
              }`}
              style={{ background: color }}
            >
              {active && <Check size={13} style={{ color: presetTone.text }} />}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void copy()}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-line px-3 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hex }} />
          <span className="font-mono uppercase tracking-wide">{hex}</span>
          <span className="ml-auto flex items-center gap-1">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </span>
        </button>

        {canPick && (
          <button
            onClick={() => void pickScreen()}
            className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
          >
            <Pipette size={12} />
            Пипетка
          </button>
        )}

        <button
          onClick={reset}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
        >
          <RotateCcw size={12} />
          Сбросить
        </button>
      </div>
    </div>
  );
}
