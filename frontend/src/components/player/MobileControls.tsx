"use client";

import { Heart, Repeat, Repeat1, SkipBack, SkipForward, ThumbsDown } from "lucide-react";

import { SimilarIcon } from "@/components/icons";
import { coverSource } from "@/lib/audio";
import { playSimilar } from "@/lib/similar";
import { usePlayer, type Track } from "@/store/playerStore";

import PlayButton from "./PlayButton";

type Props = {
  track: Track;
  playing: boolean;
  buffering: boolean;
};

export default function MobileControls({ track, playing, buffering }: Props) {
  const liked = usePlayer((state) => Boolean(state.likes[track.id]));
  const repeat = usePlayer((state) => state.repeat);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const setRepeat = usePlayer((state) => state.setRepeat);
  const setFullscreen = usePlayer((state) => state.setFullscreen);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const dislike = usePlayer((state) => state.dislike);
  const ensureQueue = usePlayer((state) => state.ensureQueue);

  const cycleRepeat = () => {
    if (repeat === "off") setRepeat("all");
    else if (repeat === "all") setRepeat("one");
    else setRepeat("off");
  };

  return (
    <>
      <div className="flex items-center gap-2.5 pb-1 pt-1 sm:hidden">
        <button onClick={() => setFullscreen(true)} className="shrink-0" aria-label="Открыть плеер">
          <img
            src={coverSource(track.cover_big, "small")}
            alt=""
            className="h-9 w-9 rounded-md border border-line object-cover"
          />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium">{track.title}</p>
          <p className="truncate text-[11px] text-muted">{track.artist}</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center pb-2 sm:hidden">
        <div className="flex items-center justify-between">
          <button
            onClick={() => void toggleLike(track)}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${
              liked ? "text-accent" : "text-muted"
            }`}
            aria-label="Лайк"
          >
            <Heart size={16} fill={liked ? "currentColor" : "none"} />
          </button>

          <button
            onClick={previous}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
            aria-label="Назад"
          >
            <SkipBack size={17} />
          </button>
        </div>

        <PlayButton playing={playing} buffering={buffering} onClick={toggle} />

        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              next();
              void ensureQueue();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
            aria-label="Вперёд"
          >
            <SkipForward size={17} />
          </button>

          <button
            onClick={() => void dislike(track)}
            disabled={liked}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted disabled:opacity-30"
            aria-label="Не нравится"
          >
            <ThumbsDown size={16} />
          </button>

          <button
            onClick={cycleRepeat}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${
              repeat === "off" ? "text-muted" : "text-accent"
            }`}
            aria-label="Повтор"
          >
            {repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>

          <button
            onClick={() => void playSimilar(track)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
            aria-label="Похожие треки"
          >
            <SimilarIcon size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
