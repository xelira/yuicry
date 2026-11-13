"use client";

import { useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";

import { audioElement } from "@/lib/audio";
import type { LyricLine, LyricsResult } from "@/lib/lyrics";
import type { Track } from "@/store/playerStore";

type Props = {
  track: Track;
  lyrics: LyricsResult | null;
  loading: boolean;
  onSeek: (seconds: number) => void;
  onArtist: (id: string) => void;
  onAlbum: (id: string) => void;
};

const lead = 0.14;
const maxHold = 8;
const scrollPause = 2500;

export default function LyricsStage({ track, lyrics, loading, onSeek, onArtist, onAlbum }: Props) {
  const [time, setTime] = useState(0);
  const [spacer, setSpacer] = useState(24);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const centered = useRef(-2);
  const holdUntil = useRef(0);

  const lines = lyrics?.lines ?? [];

  useEffect(() => {
    const audio = audioElement();
    let frame = 0;
    let last = -1;

    const tick = () => {
      const value = audio.currentTime;

      if (Math.abs(value - last) > 0.03) {
        last = value;
        setTime(value);
      }

      frame = requestAnimationFrame(tick);
    };

    setTime(audio.currentTime);
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;

    const update = () => setSpacer(Math.max(20, Math.round(box.clientHeight / 2 - 44)));

    update();

    const observer = new ResizeObserver(update);
    observer.observe(box);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    centered.current = -2;
  }, [track.id, lines.length]);

  let active = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= time + lead) active = index;
  }

  const current = active >= 0 ? lines[active] : null;
  const next = active >= 0 ? lines[active + 1] : null;
  const holdEnd = current
    ? Math.min(next ? next.time : current.time + maxHold, current.time + maxHold)
    : 0;
  const progress = current
    ? Math.min(1, Math.max(0, (time - current.time) / Math.max(0.4, holdEnd - current.time)))
    : 0;

  useEffect(() => {
    if (!lines.length) return;

    const target = active >= 0 ? active : 0;
    if (centered.current === target) return;
    if (Date.now() < holdUntil.current) return;

    const line = lineRefs.current[target];
    const box = scrollRef.current;
    if (!line || !box) return;

    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: active >= 0 ? "smooth" : "auto" });
    centered.current = target;
  }, [active, lines.length, spacer]);

  const pauseAutoScroll = () => {
    holdUntil.current = Date.now() + scrollPause;
  };

  const seek = (line: LyricLine) => {
    onSeek(Math.max(0, line.time));
  };

  return (
    <div className="flex min-h-0 w-full max-w-[760px] flex-1 flex-col">
      <div className="w-full pb-3">
        <h2 className="truncate text-[clamp(20px,3.2vw,30px)] font-semibold tracking-tight text-white">
          {track.title}
        </h2>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-white/55">
          {track.artist_id ? (
            <button onClick={() => onArtist(track.artist_id!)} className="truncate hover:text-white">
              {track.artist}
            </button>
          ) : (
            <span className="truncate">{track.artist}</span>
          )}

          {track.album_id && track.album && (
            <>
              <span className="text-white/25">·</span>
              <button onClick={() => onAlbum(track.album_id!)} className="truncate hover:text-white">
                {track.album}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.48), transparent 72%)",
          }}
        />

        <div
          ref={scrollRef}
          onPointerDown={pauseAutoScroll}
          onWheel={pauseAutoScroll}
          className="custom-scroll relative min-h-0 flex-1 overflow-y-auto px-2"
          style={{
            maskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
          }}
        >
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
              <p className="text-[13px] text-white/45">Загружаю текст…</p>
            </div>
          ) : lines.length ? (
            <>
              <div style={{ height: spacer }} aria-hidden="true" />

              <div className="flex flex-col gap-3">
                {lines.map((line, index) => {
                  const isActive = index === active;
                  const isPast = index < active;

                  return (
                    <button
                      key={`${line.time}-${index}`}
                      ref={(node) => {
                        lineRefs.current[index] = node;
                      }}
                      onClick={() => seek(line)}
                      className="group block w-full text-center"
                    >
                      {isActive ? (
                        <span
                          className="block text-[clamp(23px,4.6vw,38px)] font-semibold leading-[1.3] tracking-tight"
                          style={{
                            backgroundImage: `linear-gradient(90deg, var(--accent) ${progress * 100}%, rgba(255,255,255,0.94) ${progress * 100}%)`,
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                            WebkitTextFillColor: "transparent",
                            filter: "drop-shadow(0 0 26px rgb(var(--accent-rgb) / 0.3))",
                          }}
                        >
                          {line.text}
                        </span>
                      ) : (
                        <span
                          className={`block text-[clamp(17px,2.5vw,25px)] leading-[1.35] transition-colors duration-300 ${
                            isPast
                              ? "text-white/20 group-hover:text-white/55"
                              : "text-white/45 group-hover:text-white/75"
                          }`}
                        >
                          {line.text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: spacer }} aria-hidden="true" />
            </>
          ) : lyrics?.plain ? (
            <div className="mx-auto max-w-[560px] whitespace-pre-line py-10 text-center text-[14px] leading-relaxed text-white/70">
              {lyrics.plain}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Music2 size={24} className="text-white/30" />
              <p className="text-[13px] text-white/50">Текст не найден</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
