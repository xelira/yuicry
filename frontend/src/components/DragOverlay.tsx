"use client";

import { useEffect } from "react";
import { Disc3, Trash2 } from "lucide-react";

import { coverSource } from "@/lib/audio";
import { useDrag } from "@/store/dragStore";

export default function DragOverlay() {
  const item = useDrag((state) => state.item);
  const x = useDrag((state) => state.x);
  const y = useDrag((state) => state.y);
  const over = useDrag((state) => state.over);
  const consuming = useDrag((state) => state.consuming);

  useEffect(() => {
    if (!item) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [Boolean(item)]);

  if (!item) return null;

  const hole = item.kind === "track";

  return (
    <div className="pointer-events-none fixed inset-0 z-[95]">
      <div className="absolute inset-0 animate-[fade-in_.2s_ease-out] bg-black/35 backdrop-blur-[2px]" />

      <div className="absolute left-1/2 top-[calc(18px+var(--inset-top,0px))] flex -translate-x-1/2 flex-col items-center gap-3">
        {hole ? (
          <div
            className={`relative h-32 w-32 transition-transform duration-300 ${
              over ? "scale-110" : "scale-95"
            }`}
          >
            <div className="absolute -inset-8 rounded-full bg-black/80 blur-2xl" />
            <div
              className="absolute -inset-4 rounded-full"
              style={{ boxShadow: "0 0 70px 22px rgba(255,255,255,0.08)" }}
            />
            <div
              className="absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.85) 42deg, rgba(255,255,255,0.16) 92deg, transparent 140deg, transparent 220deg, rgba(255,255,255,0.38) 292deg, transparent 360deg)",
              }}
            />
            <div className="absolute inset-[7px] rounded-full bg-black shadow-[inset_0_0_44px_20px_#000]" />
            <div className="absolute inset-0 animate-[spin_4s_linear_infinite_reverse] rounded-full border border-white/15" />
            <div
              className={`absolute inset-0 rounded-full border transition-colors ${
                over ? "border-white/40" : "border-white/10"
              }`}
            />
            <div
              className={`absolute inset-2 rounded-full border border-white/10 ${
                over ? "animate-[hole-pulse_1.1s_ease-in-out_infinite]" : ""
              }`}
            />
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2">
              <span className="absolute h-1 w-1 animate-[hole-orbit_2.4s_linear_infinite] rounded-full bg-white/70" />
              <span className="absolute h-1 w-1 animate-[hole-orbit_2.4s_linear_infinite] rounded-full bg-white/40 [animation-delay:0.8s]" />
              <span className="absolute h-0.5 w-0.5 animate-[hole-orbit_2.4s_linear_infinite] rounded-full bg-white/60 [animation-delay:1.6s]" />
            </div>
          </div>
        ) : (
          <div
            className={`flex flex-col items-center gap-2 rounded-3xl border px-6 py-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
              over
                ? "scale-105 border-accent bg-accent/15 text-accent"
                : "border-line bg-surface/90 text-muted"
            }`}
          >
            <Trash2
              size={26}
              className={over ? "animate-[trash-shake_.45s_ease-in-out_infinite]" : ""}
            />
            <span className="text-[11px] font-medium">Удалить плейлист</span>
          </div>
        )}

        <span className={`text-[11px] ${hole ? "text-white/60" : "text-muted"}`}>
          {over ? "Отпусти" : hole ? "Удали трек" : "Отпусти над корзиной"}
        </span>
      </div>

      <div
        className="absolute left-0 top-0 w-[220px] rounded-2xl border border-line bg-surface p-2 shadow-2xl"
        style={{
          transform: consuming
            ? `translate3d(calc(50vw - 110px), calc(18px + var(--inset-top,0px) - 24px), 0) scale(0.06) rotate(24deg)`
            : `translate3d(${x - 110}px, ${y - 40}px, 0) rotate(-2deg) scale(1.03)`,
          opacity: consuming || over ? 0 : 1,
          transition: consuming
            ? "transform .34s cubic-bezier(.4,0,.2,1), opacity .34s ease"
            : over
              ? "opacity .18s ease"
              : "none",
        }}
      >
        <div className="flex items-center gap-2.5">
          {item.cover ? (
            <img
              src={coverSource(item.cover, "small")}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 text-muted">
              <Disc3 size={17} />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium">{item.title}</span>
            <span className="block truncate text-[10px] text-muted">
              {hole ? "Трек" : "Плейлист"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
