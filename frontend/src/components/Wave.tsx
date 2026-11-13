"use client";

import { useState } from "react";
import { Loader2, Maximize2, Play } from "lucide-react";

import { warmTrack } from "@/lib/audio";
import { currentTrack, usePlayer, type Track } from "@/store/playerStore";

export default function Wave() {
  const [loading, setLoading] = useState(false);

  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const playQueue = usePlayer((state) => state.playQueue);
  const setFullscreen = usePlayer((state) => state.setFullscreen);

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

  return (
    <section className="relative mx-auto mt-6 w-full max-w-[760px] overflow-hidden rounded-[28px] border border-line shadow-lift">
      {track && (
        <img
          src={track.cover_big}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
      )}
      <div className="absolute inset-0 bg-bg/80" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/15 via-transparent to-transparent" />

      <div className="relative flex min-h-[300px] flex-col items-center justify-center p-6 text-center sm:min-h-[340px] sm:p-9">
        {!track ? (
          <div className="flex flex-col items-center">
            <h1 className="text-[clamp(34px,5vw,56px)] font-semibold leading-[1.05] tracking-tight">
              Моя волна
            </h1>

            <button
              onClick={() => void launch()}
              disabled={loading}
              className="mt-7 flex h-12 w-fit items-center gap-2 rounded-full bg-ink px-6 text-[13px] font-medium text-bg transition hover:opacity-90 disabled:opacity-50"
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
          <div className="flex flex-col items-center">
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
              <span className="absolute inset-0 flex items-center justify-center bg-bg/0 opacity-0 transition group-hover:bg-bg/30 group-hover:opacity-100">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg">
                  <Maximize2 size={16} />
                </span>
              </span>
            </button>

            <h1 className="mt-6 line-clamp-2 text-[clamp(26px,4.4vw,50px)] font-semibold leading-[1.14] tracking-tight">
              {track.title}
            </h1>
            <p className="mt-2 truncate text-[14px] text-muted">{track.artist}</p>

            {playing && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                играет
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
