"use client";

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";

import { TrackSkeleton } from "@/components/Skeleton";
import { coverSource } from "@/lib/audio";
import { usePlayer, type Track } from "@/store/playerStore";
import { useSimilar } from "@/store/similarStore";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function SimilarSheet() {
  const track = useSimilar((state) => state.track);
  const close = useSimilar((state) => state.close);
  const playQueue = usePlayer((state) => state.playQueue);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!track) return;

    let alive = true;
    setTracks([]);
    setError("");
    setLoading(true);

    fetch(`/api/similar/${track.id}`)
      .then((response) => {
        if (!response.ok) throw new Error("similar");
        return response.json();
      })
      .then((data) => {
        if (alive) setTracks(data.tracks ?? []);
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить похожие");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [track?.id, attempt]);

  useEffect(() => {
    if (!track) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [track, close]);

  if (!track) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button
        onClick={close}
        aria-label="Закрыть"
        className="absolute inset-0 animate-[fade-in_.25s_ease-out] bg-black/60 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Похожие треки"
        className="relative flex max-h-[84dvh] w-full animate-[sheet-in_.45s_cubic-bezier(.22,1,.36,1)] flex-col overflow-hidden rounded-t-[28px] border border-line bg-bg shadow-2xl sm:max-w-[560px] sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Похожие</p>
            <h2 className="mt-1 truncate text-[17px] font-medium tracking-tight">
              {track.title}
            </h2>
            <p className="truncate text-[12px] text-muted">{track.artist}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {tracks.length > 0 && (
              <button
                onClick={() => {
                  playQueue(tracks);
                  close();
                }}
                className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-accentText transition hover:brightness-110"
              >
                <Play size={12} fill="currentColor" />
                Играть все
              </button>
            )}

            <button
              onClick={close}
              aria-label="Закрыть"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto p-2 pb-[calc(8px+var(--inset-bottom,0px))]">
          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-[fade-up_.4s_cubic-bezier(.22,1,.36,1)]"
                  style={{ animationDelay: `${index * 45}ms`, animationFillMode: "both" }}
                >
                  <TrackSkeleton />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-[13px] text-muted">{error}</p>
              <button
                onClick={() => setAttempt((value) => value + 1)}
                className="rounded-full border border-line px-3 py-1.5 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
              >
                Попробовать снова
              </button>
            </div>
          ) : tracks.length === 0 ? (
            <p className="px-6 py-14 text-center text-[13px] text-muted">
              Похожих треков не нашлось.
            </p>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-muted">
                {tracks.length} треков
              </p>

              {tracks.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    playQueue(tracks, index);
                    close();
                  }}
                  className="flex w-full animate-[fade-up_.4s_cubic-bezier(.22,1,.36,1)] items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-surface2"
                  style={{
                    animationDelay: `${Math.min(index, 12) * 35}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <img
                    src={coverSource(item.cover_big, "small")}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-lg border border-line object-cover"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{item.title}</span>
                    <span className="block truncate text-[11px] text-muted">{item.artist}</span>
                  </span>

                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {formatTime(item.duration)}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
