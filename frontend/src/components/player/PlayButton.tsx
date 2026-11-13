"use client";

import { Loader2, Pause, Play } from "lucide-react";

type Props = {
  playing: boolean;
  buffering: boolean;
  progress?: number;
  onClick: () => void;
};

export default function PlayButton({ playing, buffering, progress = 0, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accentText shadow-[0_0_26px_-10px_var(--accent)] transition hover:brightness-110"
      aria-label={playing ? "Пауза" : "Играть"}
    >
      {buffering ? (
        progress > 0 && progress < 100 ? (
          <span className="text-[10px] font-medium tabular-nums">{progress}%</span>
        ) : (
          <Loader2 size={16} className="animate-spin" />
        )
      ) : playing ? (
        <Pause size={15} fill="currentColor" />
      ) : (
        <Play size={15} fill="currentColor" className="ml-0.5" />
      )}
    </button>
  );
}
