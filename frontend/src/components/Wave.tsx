"use client";

import { useEffect, useState } from "react";
import { AudioWaveform, Loader2, Maximize2 } from "lucide-react";

import { genreLabel } from "@/lib/genres";
import type { Palette } from "@/lib/palette";
import { playWave, rememberWaveGenre, savedWaveGenre } from "@/lib/wave";
import { useNav } from "@/store/navStore";
import { currentTrack, usePlayer } from "@/store/playerStore";
import { coverSource } from "@/lib/audio";
import WaveGenres from "@/components/WaveGenres";

type Props = {
  palette: Palette;
};

export default function Wave({ palette }: Props) {
  const [loading, setLoading] = useState(false);
  const [genre, setGenre] = useState("");

  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const setFullscreen = usePlayer((state) => state.setFullscreen);
  const openArtist = useNav((state) => state.openArtist);
  const openAlbum = useNav((state) => state.openAlbum);

  useEffect(() => {
    setGenre(savedWaveGenre());
  }, []);

  const chooseGenre = (id: string) => {
    setGenre(id);
    rememberWaveGenre(id);
  };

  const launch = async () => {
    setLoading(true);
    try {
      await playWave(genre);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative mx-auto mt-6 w-full max-w-[760px] overflow-hidden rounded-[28px] border border-line shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-bg/70" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 120% at 15% 0%, ${palette[0]}30, transparent 60%), radial-gradient(100% 100% at 90% 100%, ${palette[1]}2e, transparent 55%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-transparent" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative flex min-h-[300px] flex-col items-center justify-center p-6 text-center sm:min-h-[340px] sm:p-9">
        {!track ? (
          <div className="flex w-full flex-col items-center">
            <div className="relative flex h-16 items-end justify-center gap-1.5" aria-hidden="true">
              <div className="absolute inset-0 -z-10 rounded-full bg-accent/20 blur-2xl" />
              {[0.4, 0.75, 0.55, 1, 0.65, 0.35].map((value, index) => (
                <span
                  key={index}
                  className="w-1.5 origin-bottom rounded-full bg-accent/80"
                  style={{
                    height: `${value * 100}%`,
                    animation: `wave 2.4s ease-in-out ${index * 0.18}s infinite`,
                  }}
                />
              ))}
            </div>

            <h1 className="mt-6 text-[clamp(34px,5vw,56px)] font-semibold leading-[1.05] tracking-tight">
              Моя волна
            </h1>

            <p className="mt-2 max-w-[380px] text-[13px] leading-relaxed text-muted">
              {genre
                ? `20 треков в жанре «${genreLabel(genre)}»: то, что сейчас слушают.`
                : "20 треков под твой вкус: похожее на лайки и немного нового."}
            </p>

            <div className="mt-5 w-full min-w-0 max-w-[560px]">
              <WaveGenres value={genre} onChange={chooseGenre} />
            </div>

            <button
              onClick={() => void launch()}
              disabled={loading}
              className="mt-4 flex h-12 w-fit items-center gap-2 rounded-full bg-accent px-6 text-[13px] font-medium text-accentText shadow-[0_0_30px_-12px_var(--accent)] transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <AudioWaveform size={15} />
              )}
              Собрать волну
            </button>

            <p className="mt-5 hidden text-[11px] text-muted/80 sm:block">
              Пробел — пауза · ←/→ — переключение · / — поиск
            </p>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center">
            <button
              onClick={() => setFullscreen(true)}
              className="group relative h-[180px] w-[180px] shrink-0 overflow-hidden rounded-2xl border border-line shadow-2xl sm:h-[220px] sm:w-[220px]"
              aria-label="Открыть плеер"
            >
              <img
                src={coverSource(track.cover_big, "large")}
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-bg/0 opacity-0 transition group-hover:bg-bg/30 group-hover:opacity-100">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accentText shadow-[0_0_24px_-10px_var(--accent)]">
                  <Maximize2 size={16} />
                </span>
              </span>
            </button>

            <h1 className="mt-6 line-clamp-2 text-[clamp(26px,4.4vw,50px)] font-semibold leading-[1.14] tracking-tight">
              {track.title}
            </h1>
            <div className="mt-2 flex items-center justify-center gap-2 text-[14px] text-muted">
              {track.artist_id ? (
                <button
                  onClick={() => openArtist(track.artist_id!)}
                  className="truncate transition-colors hover:text-ink"
                >
                  {track.artist}
                </button>
              ) : (
                <span className="truncate">{track.artist}</span>
              )}

              {track.album_id && track.album && (
                <>
                  <span className="text-lineStrong">·</span>
                  <button
                    onClick={() => openAlbum(track.album_id!)}
                    className="max-w-[240px] truncate transition-colors hover:text-ink"
                  >
                    {track.album}
                  </button>
                </>
              )}
            </div>

            {playing && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                играет
              </p>
            )}

            <div className="mt-5 w-full min-w-0 max-w-[520px]">
              <WaveGenres value={genre} onChange={chooseGenre} />
            </div>

            <button
              onClick={() => void launch()}
              disabled={loading}
              className="mt-3 flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[12px] font-medium text-accentText shadow-[0_0_28px_-12px_var(--accent)] transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <AudioWaveform size={14} />
              )}
              Собрать волну
            </button>

            <p className="mt-2 text-[11px] text-muted/80">
              {genre
                ? `Новая подборка в жанре «${genreLabel(genre)}» заменит очередь`
                : "Новая подборка по твоим лайкам заменит очередь"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
