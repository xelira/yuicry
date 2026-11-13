"use client";

import { Heart } from "lucide-react";

import { usePlayer, type Track } from "@/store/playerStore";

type Props = {
  track: Track;
  className?: string;
};

export default function LikeButton({ track, className = "" }: Props) {
  const liked = usePlayer((state) => Boolean(state.likes[track.id]));
  const toggleLike = usePlayer((state) => state.toggleLike);

  return (
    <button
      onClick={() => void toggleLike(track)}
      aria-label={liked ? "Убрать из избранного" : "В избранное"}
      aria-pressed={liked}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface ${
        liked ? "text-accent" : "text-muted hover:text-ink"
      } ${className}`}
    >
      <Heart size={15} fill={liked ? "currentColor" : "none"} />
    </button>
  );
}
