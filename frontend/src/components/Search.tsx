"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Loader2, Play, Search as SearchIcon, X } from "lucide-react";

import AddToAlbum from "@/components/AddToAlbum";
import EmptyState from "@/components/EmptyState";
import { TrackSkeleton } from "@/components/Skeleton";
import Equalizer from "@/components/Equalizer";
import { useNav } from "@/store/navStore";
import { usePlayer, type Track } from "@/store/playerStore";
import { coverSource } from "@/lib/audio";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [asked, setAsked] = useState(false);
  const [more, setMore] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playQueue = usePlayer((state) => state.playQueue);
  const openArtist = useNav((state) => state.openArtist);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const likes = usePlayer((state) => state.likes);
  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const playing = usePlayer((state) => state.playing);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("yuicry:focus-search", focus);
    return () => window.removeEventListener("yuicry:focus-search", focus);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const value = query.trim();
    if (value.length < 2) {
      setTracks([]);
      setAsked(false);
      setMore(false);
      return;
    }

    setMore(false);

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        if (!response.ok) {
          setTracks([]);
          return;
        }
        const data = await response.json();
        setTracks(data.tracks ?? []);
        setMore(Boolean(data.more));
        setAsked(true);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const loadMore = async () => {
    const value = query.trim();
    if (!value || loadingMore) return;

    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(value)}&index=${tracks.length}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      const incoming: Track[] = data.tracks ?? [];

      setTracks((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...incoming.filter((item) => !seen.has(item.id))];
      });
      setMore(Boolean(data.more));
    } finally {
      setLoadingMore(false);
    }
  };

  const start = (track: Track) => {
    const index = tracks.findIndex((item) => item.id === track.id);
    playQueue(tracks, index < 0 ? 0 : index);
  };

  return (
    <section className="pt-8">
      <div className="aurora-text flex items-center justify-between pb-4">
        <p className="text-[12px] text-muted">
          {asked ? `${tracks.length}${more ? "+" : ""} треков` : "Каталог Deezer"}
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg px-4 shadow-lift transition-colors focus-within:border-lineStrong focus-within:ring-2 focus-within:ring-accent/15">
        <SearchIcon size={15} className="text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && tracks.length > 0) start(tracks[0]);
          }}
          placeholder="Название или исполнитель"
          className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-muted"
        />
        {loading && <Loader2 size={15} className="animate-spin text-muted" />}

        {query && !loading && (
          <button
            onClick={() => setQuery("")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
            aria-label="Очистить поиск"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {loading && tracks.length === 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-bg p-1.5 shadow-lift">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <TrackSkeleton key={index} />
          ))}
        </div>
      )}

      {asked && tracks.length === 0 && !loading && (
        <EmptyState
          title="Ничего не нашлось"
          text="Попробуй название трека, исполнителя или другой запрос."
        />
      )}

      {tracks.length > 0 && (
        <div className="mt-4 animate-[fade-up_.4s_cubic-bezier(.22,1,.36,1)] overflow-hidden rounded-2xl border border-line bg-bg shadow-lift">
          <ul className="p-1.5">
            {tracks.map((track) => {
              const active = current?.id === track.id;
              const liked = Boolean(likes[track.id]);

              return (
                <li key={track.id}>
                  <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface2">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <button
                        onClick={() => start(track)}
                        className="relative shrink-0"
                        aria-label={`Играть ${track.title}`}
                      >
                        <img
                          src={coverSource(track.cover_big, "small")}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          className="h-10 w-10 rounded-md border border-line object-cover"
                        />

                        {active ? (
                          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60">
                            <Equalizer active={playing} />
                          </span>
                        ) : (
                          <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-bg/60 group-hover:flex">
                            <Play size={14} />
                          </span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => start(track)}
                          className={`block w-full truncate text-left text-[13px] ${
                            active ? "text-accent" : ""
                          }`}
                        >
                          {track.title}
                        </button>

                        {track.artist_id ? (
                          <button
                            onClick={() => openArtist(track.artist_id!)}
                            className="block w-full truncate text-left text-[12px] text-muted hover:text-ink"
                          >
                            {track.artist}
                          </button>
                        ) : (
                          <span className="block truncate text-[12px] text-muted">
                            {track.artist}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="text-[11px] tabular-nums text-muted">
                      {formatDuration(track.duration)}
                    </span>

                    <AddToAlbum track={track} />

                    <button
                      onClick={() => void toggleLike(track)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface ${
                        liked ? "text-accent" : "text-muted hover:text-ink"
                      }`}
                      aria-label={liked ? "Убрать из избранного" : "В избранное"}
                    >
                      <Heart size={15} fill={liked ? "currentColor" : "none"} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {more && (
            <div className="border-t border-line p-2">
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] text-muted transition-colors hover:bg-surface2 hover:text-ink disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={13} className="animate-spin" />}
                Показать ещё
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
