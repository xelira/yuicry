"use client";

import { useEffect, useState } from "react";
import {
  Heart,
  Loader2,
  Pause,
  Play,
  Maximize2,
  SkipBack,
  SkipForward,
} from "lucide-react";

import TrackMenu from "@/components/TrackMenu";
import { warmTrack } from "@/lib/audio";
import { currentTrack, usePlayer, type Track } from "@/store/playerStore";

export default function Wave() {
  const [loading, setLoading] = useState(false);

  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const playQueue = usePlayer((state) => state.playQueue);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const dislike = usePlayer((state) => state.dislike);
  const setFullscreen = usePlayer((state) => state.setFullscreen);
  const liked = usePlayer((state) => (track ? Boolean(state.likes[track.id]) : false));

  const launch = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/wave");
      if (!response.ok) return;

      const data = await response.json();
      const tracks: Track[] = data.tracks ?? [];
      if (tracks.length > 0) {
        playQueue(tracks);
        warmTrack(tracks[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  const playSimilar = async () => {
    if (!track) return;

    const response = await fetch(`/api/similar/${track.id}`);
    if (!response.ok) return;

    const data = await response.json();
    if (data.tracks?.length) playQueue(data.tracks);
  };

  return (
    <section className="relative mt-6 overflow-hidden rounded-3xl border border-line shadow-lift">
      {track && (
        <img
          src={track.cover_big}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
      )}
      <div className="absolute inset-0 bg-bg/80" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/15 via-transparent to-transparent" />
      <div className="relative flex min-h-[300px] flex-col justify-center p-6 sm:min-h-[340px] sm:p-9">
        {!track ? (
          <div className="flex flex-1 flex-col justify-center">
            <h1 className="text-[clamp(38px,6.5vw,68px)] font-semibold leading-[0.95] tracking-tight text-ink">
              Моя волна
            </h1>

            <button
              onClick={() => void launch()}
              disabled={loading}
              className="mt-7 flex h-12 w-fit items-center gap-2 self-start rounded-full bg-ink px-6 text-[13px] font-medium text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
              Собрать волну
            </button>

          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <button
              onClick={() => setFullscreen(true)}
              className="group relative h-[180px] w-[180px] shrink-0 overflow-hidden rounded-2xl border border-line shadow-2xl sm:h-[220px] sm:w-[220px]"
              aria-label="Открыть плеер"
            >
              <img
                src={track.cover_big}
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-bg/30 group-hover:opacity-100">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg">
                  <Maximize2 size={16} />
                </span>
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="line-clamp-2 pb-1 text-[clamp(26px,4.4vw,50px)] font-semibold leading-[1.14] tracking-tight text-ink">
                {track.title}
              </h1>
              <p className="mt-2 truncate text-[14px] text-muted">{track.artist}</p>
              <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => void toggleLike(track)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface2 ${
                      liked ? "text-ink" : "text-muted hover:text-ink"
                    }`}
                    aria-label="Лайк"
                  >
                    <Heart size={18} fill={liked ? "currentColor" : "none"} />
                  </button>

                  <button
                    onClick={previous}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-ink"
                    aria-label="Назад"
                  >
                    <SkipBack size={18} />
                  </button>
                </div>

                <button
                  onClick={toggle}
                  className="mx-3 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-bg transition hover:opacity-90"
                  aria-label={playing ? "Пауза" : "Играть"}
                >
                  {playing ? (
                    <Pause size={19} fill="currentColor" />
                  ) : (
                    <Play size={19} fill="currentColor" className="ml-0.5" />
                  )}
                </button>

                <div className="flex items-center justify-start gap-1">
                  <button
                    onClick={next}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-ink"
                    aria-label="Вперёд"
                  >
                    <SkipForward size={18} />
                  </button>

                  <TrackMenu
                    track={track}
                    liked={liked}
                    onSimilar={() => void playSimilar()}
                    onDislike={() => void dislike(track)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
