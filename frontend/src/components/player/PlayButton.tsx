"use client";

import { Loader2, Pause, Play } from "lucide-react";

type Props = {
  playing: boolean;
  buffering: boolean;
  onClick: () => void;
};

export default function PlayButton({ playing, buffering, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg transition hover:opacity-90"
      aria-label={playing ? "Пауза" : "Играть"}
    >
      {buffering && playing ? (
        <Loader2 size={16} className="animate-spin" />
      ) : playing ? (
        <Pause size={15} fill="currentColor" />
      ) : (
        <Play size={15} fill="currentColor" className="ml-0.5" />
      )}
    </button>
  );
}
