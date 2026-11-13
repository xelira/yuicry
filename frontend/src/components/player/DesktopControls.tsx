"use client";

import { useEffect, useRef, useState } from "react";
import {
  Heart,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  ThumbsDown,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

import { SimilarIcon } from "@/components/icons";
import { coverSource } from "@/lib/audio";
import { useSimilar } from "@/store/similarStore";
import { useNav } from "@/store/navStore";
import { usePlayer, type Track } from "@/store/playerStore";

import { formatTime } from "./format";
import PlayButton from "./PlayButton";

const presets = [1, 0.85, 1.2];

type Props = {
  track: Track;
  playing: boolean;
  buffering: boolean;
  progress: number;
  time: number;
  duration: number;
};

export default function DesktopControls({ track, playing, buffering, progress, time, duration }: Props) {
  const speedRef = useRef<HTMLDivElement>(null);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.9);

  const liked = usePlayer((state) => Boolean(state.likes[track.id]));
  const openArtist = useNav((state) => state.openArtist);
  const repeat = usePlayer((state) => state.repeat);
  const rate = usePlayer((state) => state.rate);
  const volume = usePlayer((state) => state.volume);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const setRate = usePlayer((state) => state.setRate);
  const setVolume = usePlayer((state) => state.setVolume);
  const setRepeat = usePlayer((state) => state.setRepeat);
  const openSimilar = useSimilar((state) => state.open);
  const setFullscreen = usePlayer((state) => state.setFullscreen);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const dislike = usePlayer((state) => state.dislike);
  const ensureQueue = usePlayer((state) => state.ensureQueue);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(event.target as Node)) {
        setSpeedOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const mute = () => {
    if (volume > 0) {
      setLastVolume(volume);
      setVolume(0);
      return;
    }

    setVolume(lastVolume || 0.9);
  };

  const cycleRepeat = () => {
    if (repeat === "off") setRepeat("all");
    else if (repeat === "all") setRepeat("one");
    else setRepeat("off");
  };

  return (
    <div className="hidden h-[84px] items-center gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => setFullscreen(true)} className="shrink-0" aria-label="Открыть плеер">
          <img
            src={coverSource(track.cover_big, "small")}
            alt=""
            className="h-12 w-12 rounded-md border border-line object-cover"
          />
        </button>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{track.title}</p>
          {track.artist_id ? (
            <button
              onClick={() => openArtist(track.artist_id!)}
              className="block w-full truncate text-left text-[12px] text-muted hover:text-ink"
            >
              {track.artist}
            </button>
          ) : (
            <p className="truncate text-[12px] text-muted">{track.artist}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={previous}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
          aria-label="Назад"
        >
          <SkipBack size={17} />
        </button>

        <PlayButton playing={playing} buffering={buffering} progress={progress} onClick={toggle} />

        <button
          onClick={() => {
            next();
            void ensureQueue();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
          aria-label="Вперёд"
        >
          <SkipForward size={16} />
        </button>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => void toggleLike(track)}
          className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface2 ${
            liked ? "text-accent" : "text-muted hover:text-ink"
          }`}
          aria-label="Лайк"
          aria-pressed={liked}
        >
          <Heart size={15} fill={liked ? "currentColor" : "none"} />
        </button>

        <button
          onClick={() => void dislike(track)}
          disabled={liked}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Не нравится"
        >
          <ThumbsDown size={16} />
        </button>

        <button
          onClick={() => openSimilar(track)}
          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-muted hover:bg-surface2 hover:text-ink"
          aria-label="Похожие треки"
        >
          <SimilarIcon />
        </button>

        <button
          onClick={cycleRepeat}
          className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface2 ${
            repeat === "off" ? "text-muted hover:text-ink" : "text-accent"
          }`}
          aria-label="Повтор"
          aria-pressed={repeat !== "off"}
        >
          {repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </button>

        <span className="whitespace-nowrap text-[11px] tabular-nums text-muted">
          {formatTime(time)} / {formatTime(duration)}
        </span>

        <button
          onClick={mute}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
          aria-label="Звук"
        >
          <VolumeIcon size={16} />
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          className="range w-14"
          aria-label="Громкость"
        />

        <div ref={speedRef} className="relative">
          <button
            onClick={() => setSpeedOpen((value) => !value)}
            className="rounded-md border border-line px-2 py-1 text-[11px] tabular-nums text-muted hover:border-lineStrong hover:text-ink"
          >
            {rate.toFixed(2).replace(/0$/, "")}x
          </button>

          {speedOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-line bg-surface p-3 shadow-lift">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  Скорость
                </span>
                <span className="text-[12px] tabular-nums">{rate.toFixed(2)}x</span>
              </div>

              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
                className="range mt-3 w-full"
                aria-label="Скорость"
              />

              <div className="mt-3 flex gap-1">
                {presets.map((value) => (
                  <button
                    key={value}
                    onClick={() => setRate(value)}
                    className={`flex-1 rounded-md border px-2 py-1 text-[11px] tabular-nums ${
                      rate === value
                        ? "border-ink bg-ink text-bg"
                        : "border-line text-muted hover:border-lineStrong hover:text-ink"
                    }`}
                  >
                    {value}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
