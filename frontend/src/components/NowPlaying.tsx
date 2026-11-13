"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ChevronDown,
  FastForward,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  SkipBack,
  SkipForward,
} from "lucide-react";

import dynamic from "next/dynamic";
import LyricsStage from "@/components/LyricsStage";
import TrackMenu from "@/components/TrackMenu";

const Aurora = dynamic(() => import("@/components/Aurora"), { ssr: false, loading: () => null });
import { fallbackPalette, paletteFromCover, type Palette } from "@/lib/palette";
import { useNav } from "@/store/navStore";
import { useSimilar } from "@/store/similarStore";
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
  const showLyrics = usePlayer((state) => state.lyricsOpen);
  const setShowLyrics = usePlayer((state) => state.setLyricsOpen);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const setRepeat = usePlayer((state) => state.setRepeat);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const dislike = usePlayer((state) => state.dislike);
  const openSimilar = useSimilar((state) => state.open);
  const openArtist = useNav((state) => state.openArtist);
  const openAlbum = useNav((state) => state.openAlbum);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [palette, setPalette] = useState<Palette>(fallbackPalette);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [likeBurst, setLikeBurst] = useState(0);
  const [seekFeedback, setSeekFeedback] = useState<{ side: "left" | "right"; key: number } | null>(
    null,
  );

  const barRef = useRef<HTMLDivElement>(null);
  const lastCoverTap = useRef(0);
  const seekTaps = useRef({ left: 0, right: 0 });
  const lyricsSeq = useRef(0);

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
  }, [track?.id, setShowLyrics]);

  const lookupDuration = track?.duration ?? 0;

  useEffect(() => {
    if (!track) return;

    const seq = ++lyricsSeq.current;
    let alive = true;
    setLyricsLoading(true);

    fetchLyrics(track, lookupDuration)
      .then((value) => {
        if (alive && seq === lyricsSeq.current) setLyrics(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive && seq === lyricsSeq.current) setLyricsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [track?.id, lookupDuration]);

  const hasLyrics = Boolean(lyrics?.lines.length || lyrics?.plain);

  useEffect(() => {
    if (!open) return;

    const audio = audioElement();
    const updateDuration = () => {
      const media = audio.duration || 0;
      const full = track?.duration || 0;

      if (media > 0 && full > 35 && media < 32 && !audio.src.startsWith("blob:")) {
        setDuration(full);
      } else {
        setDuration(media || full);
      }
    };

    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => updateDuration();

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);

    setTime(audio.currentTime);
    updateDuration();
    document.body.style.overflow = "hidden";

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      document.body.style.overflow = "";
    };
  }, [open, track?.id]);

  useEffect(() => {
    if (!seekFeedback) return;

    const timer = window.setTimeout(() => setSeekFeedback(null), 700);
    return () => window.clearTimeout(timer);
  }, [seekFeedback]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (showLyrics) {
        setShowLyrics(false);
        return;
      }

      setFullscreen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, showLyrics, setFullscreen, setShowLyrics]);

  const cycleRepeat = () => {
    if (repeat === "off") setRepeat("all");
    else if (repeat === "all") setRepeat("one");
    else setRepeat("off");
  };

  if (!open || !track) return null;

  const jumpTo = (seconds: number) => {
    const audio = audioElement();
    audio.currentTime = seconds;
    setTime(seconds);
    hostSeek(seconds);
  };

  const seekZone = (side: "left" | "right") => {
    const now = Date.now();

    if (now - seekTaps.current[side] > 600) {
      seekTaps.current[side] = now;
      return;
    }

    seekTaps.current[side] = 0;

    const audio = audioElement();
    const limit = duration > 0 ? duration : audio.duration;
    const delta = side === "left" ? -10 : 10;
    const next = Math.max(
      0,
      limit > 0 ? Math.min(audio.currentTime + delta, limit) : audio.currentTime + delta,
    );

    audio.currentTime = next;
    setTime(next);
    hostSeek(next);
    setSeekFeedback({ side, key: now });
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

  return (
    <div className="fixed inset-0 z-50 animate-[fade-in_.25s_ease-out] overflow-hidden bg-black">
      <Aurora colors={palette} />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/65" />

      <div className="relative flex h-full animate-[sheet-in_.45s_cubic-bezier(.22,1,.36,1)] flex-col px-5 pb-[calc(36px+var(--inset-bottom,0px))] pt-[calc(20px+var(--inset-top,0px))] sm:px-10 sm:pb-[calc(44px+var(--inset-bottom,0px))] sm:pt-[calc(28px+var(--inset-top,0px))]">
        {!showLyrics && (
          <>
            <button
              onClick={() => seekZone("left")}
              aria-label="Перемотать на 10 секунд назад"
              className="absolute bottom-[34%] left-0 top-[16%] z-30 w-[16%] touch-manipulation sm:w-[22%]"
            >
              {seekFeedback?.side === "left" && (
                <span
                  key={seekFeedback.key}
                  className="pointer-events-none absolute left-2 top-1/2 flex -translate-y-1/2 animate-[seek-pulse_.7s_ease-out_forwards] flex-col items-center gap-1.5"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md">
                    <Rewind size={23} />
                  </span>
                  <span className="text-[11px] font-medium text-white/80">10 сек</span>
                </span>
              )}
            </button>

            <button
              onClick={() => seekZone("right")}
              aria-label="Перемотать на 10 секунд вперёд"
              className="absolute bottom-[34%] right-0 top-[16%] z-30 w-[16%] touch-manipulation sm:w-[22%]"
            >
              {seekFeedback?.side === "right" && (
                <span
                  key={seekFeedback.key}
                  className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 animate-[seek-pulse_.7s_ease-out_forwards] flex-col items-center gap-1.5"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md">
                    <FastForward size={23} />
                  </span>
                  <span className="text-[11px] font-medium text-white/80">10 сек</span>
                </span>
              )}
            </button>
          </>
        )}

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
            <LyricsStage
              track={track}
              lyrics={lyrics}
              loading={lyricsLoading}
              onSeek={jumpTo}
              onArtist={openArtist}
              onAlbum={openAlbum}
            />
          ) : (
            <>
              <div className="relative">
                <img
                  src={coverSource(track.cover_big, "large")}
                  alt=""
                  onClick={() => {
                    const now = Date.now();

                    if (now - lastCoverTap.current < 600) {
                      lastCoverTap.current = 0;
                      void toggleLike(track);
                      setLikeBurst((value) => value + 1);
                      return;
                    }

                    lastCoverTap.current = now;
                  }}
                  className="h-[min(60vw,36vh,380px)] w-[min(60vw,36vh,380px)] cursor-pointer touch-manipulation select-none rounded-2xl border border-white/20 object-cover shadow-2xl"
                />

                {likeBurst > 0 && (
                  <span
                    key={likeBurst}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  >
                    <Heart
                      size={104}
                      fill={liked ? "currentColor" : "none"}
                      className="animate-[heart-burst_.7s_ease-out_forwards] text-white drop-shadow-2xl"
                    />
                  </span>
                )}

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
                <div className="mt-1.5 flex items-center justify-center gap-2 text-[14px] text-white/65">
                {track.artist_id ? (
                  <button
                    onClick={() => openArtist(track.artist_id!)}
                    className="truncate hover:text-white"
                  >
                    {track.artist}
                  </button>
                ) : (
                  <span className="truncate">{track.artist}</span>
                )}

                {track.album_id && track.album && (
                  <>
                    <span className="text-white/30">·</span>
                    <button
                      onClick={() => openAlbum(track.album_id!)}
                      className="max-w-[240px] truncate hover:text-white"
                    >
                      {track.album}
                    </button>
                  </>
                )}
              </div>
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
            <span>{formatTime(duration)}</span>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => void toggleLike(track)}
                className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 ${
                  liked ? "text-accent" : "text-white/70 hover:text-white"
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
              className="mx-3 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accentText shadow-[0_0_44px_-12px_var(--accent)] transition hover:brightness-110"
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
                  repeat === "off" ? "text-white/70 hover:text-white" : "text-accent"
                }`}
                aria-label="Повтор"
              >
                {repeat === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />}
              </button>

              <TrackMenu
                track={track}
                liked={liked}
                onSimilar={() => openSimilar(track)}
                onDislike={() => void dislike(track)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
