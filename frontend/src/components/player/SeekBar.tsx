"use client";

import { useRef, useState } from "react";

import { formatTime } from "./format";

type Props = {
  time: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onSeekEnd: () => void;
  labels?: boolean;
};

export default function SeekBar({ time, duration, onSeek, onSeekEnd, labels = false }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const progress = duration > 0 ? Math.min(time / duration, 1) : 0;
  const remaining = Math.max(0, duration - time);

  const seek = (clientX: number) => {
    const bar = barRef.current;
    if (!bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    onSeek(ratio * duration);
  };

  return (
    <>
      <div
        ref={barRef}
        role="slider"
        aria-label="Перемотка"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        className="group relative h-4 w-full cursor-pointer touch-none"
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging) seek(event.clientX);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
          onSeekEnd();
        }}
      >
        <div className="absolute inset-x-0 top-[5px] h-[6px] rounded-full bg-line" />
        <div
          className="absolute top-[5px] h-[6px] rounded-full bg-accent"
          style={{ width: `${progress * 100}%` }}
        />
        <span
          className={`absolute top-[1px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-accent ${
            dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ left: `${Math.min(99, Math.max(1, progress * 100))}%` }}
        />
      </div>

      {labels && (
        <div className="flex items-center justify-between pb-0.5 text-[10px] tabular-nums text-muted sm:hidden">
          <span>{formatTime(time)}</span>
          <span>−{formatTime(remaining)}</span>
        </div>
      )}
    </>
  );
}
