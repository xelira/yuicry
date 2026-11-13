"use client";

import { useEffect, useRef, useState } from "react";
import { AlignLeft, ChevronDown, Heart, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward } from "lucide-react";

import dynamic from "next/dynamic";
import TrackMenu from "@/components/TrackMenu";

const Aurora = dynamic(() => import("@/components/Aurora"), { ssr: false, loading: () => null });
import { fallbackPalette, paletteFromCover, type Palette } from "@/lib/palette";
import { currentTrack, usePlayer } from "@/store/playerStore";
import { audioElement, coverSource } from "@/lib/audio";
import { fetchLyrics, type LyricsResult } from "@/lib/lyrics";
import { hostSeek } from "@/lib/host";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function NowPlaying() {
  const open = usePlayer((state) => state.fullscreen);
  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const repeat = usePlayer((state) => state.repeat);
  const liked = usePlayer((state) => (track ? Boolean(state.likes[track.id]) : false));

  const setFullscreen = usePlayer((state) => state.setFullscreen);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const setRepeat = usePlayer((state) => state.setRepeat);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const dislike = usePlayer((state) => state.dislike);
  const playQueue = usePlayer((state) => state.playQueue);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [palette, setPalette] = useState<Palette>(fallbackPalette);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!track) return;

    let alive = true;
    paletteFromCover(track.cover_big).then((colors) => {
      if (alive) setPalette(colors);
    });

    return () => {
      alive = false;
    };
  }, [track?.id]);

  useEffect(() => {
    setLyrics(null);
    setShowLyrics(false);

    if (!track) return;

    let alive = true;
    setLyricsLoading(true);

    fetchLyrics(track)
      .then((value) => {
        if (alive) setLyrics(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLyricsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [track?.id]);

  const hasLyrics = Boolean(lyrics?.lines.length || lyrics?.plain);
  const activeLine = lyrics?.lines.reduce(
    (index, line, position) => (line.time <= time + 0.15 ? position : index),
    -1,
  ) ?? -1;

  useEffect(() => {
    if (!showLyrics || activeLine < 0) return;
    lineRefs.current[activeLine]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLine, showLyrics]);

  useEffect(() => {
    if (!open) return;

    const audio = audioElement();
    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);

    setTime(audio.currentTime);
    setDuration(audio.duration || track?.duration || 0);
    document.body.style.overflow = "hidden";

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cycleRepeat = () => {
    if (repeat === "off") setRepeat("all");
    else if (repeat === "all") setRepeat("one");
    else setRepeat("off");
  };

  const playSimilar = async () => {
    if (!track) return;

    const response = await fetch(`/api/similar/${track.id}`);
    if (!response.ok) return;

    const data = await response.json();
    if (data.tracks?.length) playQueue(data.tracks);
  };

  if (!open || !track) return null;

  const jumpTo = (seconds: number) => {
    const audio = audioElement();
    audio.currentTime = seconds;
    setTime(seconds);
    hostSeek(seconds);
  };

  const seek = (clientX: number) => {
    const bar = barRef.current;
    const audio = audioElement();
    if (!bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
    setTime(ratio * duration);
  };

  const progress = duration > 0 ? Math.min(time / duration, 1) : 0;
  const remaining = Math.max(0, duration - time);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      <Aurora colors={palette} />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/65" />

      <div className="relative flex h-full flex-col px-5 pb-[calc(36px+var(--inset-bottom,0px))] pt-[calc(20px+var(--inset-top,0px))] sm:px-10 sm:pb-[calc(44px+var(--inset-bottom,0px))] sm:pt-[calc(28px+var(--inset-top,0px))]">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setFullscreen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Свернуть"
          >
            <ChevronDown size={22} />
          </button>

          {showLyrics ? (
            <button
              onClick={() => setShowLyrics(false)}
              className="rounded-full px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Обложка
            </button>
          ) : (
            <span className="w-9" />
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-4">
          {showLyrics ? (
            <>
              <div className="max-w-[640px] px-2 text-center">
                <h1 className="line-clamp-2 pb-1 text-[clamp(20px,3vw,30px)] font-semibold leading-[1.15] tracking-tight text-white">
                  {track.title}
                </h1>
                <p className="mt-1 text-[13px] text-white/60">{track.artist}</p>
              </div>

              <div className="min-h-0 w-full max-w-[640px] flex-1 overflow-y-auto rounded-2xl border border-white/15 bg-black/25 px-4 py-3 custom-scroll">
                {lyricsLoading ? (
                  <p className="py-8 text-center text-[13px] text-white/45">Загружаю текст…</p>
                ) : lyrics?.lines.length ? (
                  <div className="flex flex-col gap-0.5">
                    {lyrics.lines.map((line, index) => (
                      <button
                        key={`${line.time}-${index}`}
                        ref={(node) => {
                          lineRefs.current[index] = node;
                        }}
                        onClick={() => jumpTo(line.time)}
                        className={`block w-full rounded-md px-2 py-1 text-center text-[15px] leading-relaxed transition-colors ${
                          index === activeLine ? "text-white" : "text-white/45 hover:text-white/70"
                        }`}
                      >
                        {line.text}
                      </button>
                    ))}
                  </div>
                ) : lyrics?.plain ? (
                  <p className="whitespace-pre-line text-center text-[14px] leading-relaxed text-white/70">
                    {lyrics.plain}
                  </p>
                ) : (
                  <p className="py-8 text-center text-[13px] text-white/45">Текст не найден</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <img
                  src={coverSource(track.cover_big, "large")}
                  alt=""
                  className="h-[min(60vw,36vh,380px)] w-[min(60vw,36vh,380px)] rounded-2xl border border-white/20 object-cover shadow-2xl"
                />

                {hasLyrics && (
                  <button
                    onClick={() => setShowLyrics(true)}
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md transition-colors hover:bg-black/70"
                    aria-label="Показать текст песни"
                  >
                    <AlignLeft size={13} />
                    Текст
                  </button>
                )}
              </div>

              <div className="max-w-[640px] px-2 text-center">
                <h1 className="line-clamp-2 pb-1 text-[clamp(22px,3.6vw,38px)] font-semibold leading-[1.15] tracking-tight text-white">
                  {track.title}
                </h1>
                <p className="mt-1.5 text-[14px] text-white/65">{track.artist}</p>
              </div>
            </>
          )}
        </div>

        <div className="mx-auto w-full max-w-[640px] shrink-0">
          <div
            ref={barRef}
            role="slider"
            aria-label="Перемотка"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            className="group relative h-8 w-full cursor-pointer touch-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              seek(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) seek(event.clientX);
            }}
            onPointerUp={() => hostSeek(audioElement().currentTime || 0)}
          >
            <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-white/25" />
            <div
              className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-white"
              style={{ width: `${progress * 100}%` }}
            />
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          <div className="mt-1 flex justify-between text-[12px] tabular-nums text-white/70">
            <span>{formatTime(time)}</span>
            <span>−{formatTime(remaining)}</span>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => void toggleLike(track)}
                className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 ${
                  liked ? "text-white" : "text-white/70 hover:text-white"
                }`}
                aria-label="Лайк"
              >
                <Heart size={20} fill={liked ? "currentColor" : "none"} />
              </button>

              <button
                onClick={previous}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Назад"
              >
                <SkipBack size={21} />
              </button>
            </div>

            <button
              onClick={toggle}
              className="mx-3 flex h-16 w-16 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90"
              aria-label={playing ? "Пауза" : "Играть"}
            >
              {playing ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <div className="flex items-center justify-start gap-1">
              <button
                onClick={next}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Вперёд"
              >
                <SkipForward size={21} />
              </button>

              <button
                onClick={cycleRepeat}
                className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 ${
                  repeat === "off" ? "text-white/70 hover:text-white" : "text-white"
                }`}
                aria-label="Повтор"
              >
                {repeat === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />}
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
    </div>
  );
}
