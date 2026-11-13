"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Loader2, Play, Search as SearchIcon } from "lucide-react";

import AddToAlbum from "@/components/AddToAlbum";
import Equalizer from "@/components/Equalizer";
import { usePlayer, type Track } from "@/store/playerStore";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playQueue = usePlayer((state) => state.playQueue);
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
      return;
    }

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
        setAsked(true);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const start = (track: Track) => {
    const index = tracks.findIndex((item) => item.id === track.id);
    playQueue(tracks, index < 0 ? 0 : index);
  };

  return (
    <section className="pt-8">
      <div className="flex items-end justify-between pb-4">
        <h1 className="text-[22px] font-medium tracking-tight">Поиск</h1>
        <span className="text-[11px] tabular-nums text-muted">
          {asked ? `${tracks.length} треков` : ""}
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg px-4 shadow-lift focus-within:border-lineStrong">
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
      </div>

      {asked && tracks.length === 0 && !loading && (
        <p className="mt-8 text-[13px] text-muted">Ничего не нашлось. Попробуй иначе.</p>
      )}

      {tracks.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-bg shadow-lift">
          <ul className="p-1.5">
            {tracks.map((track) => {
              const active = current?.id === track.id;
              const liked = Boolean(likes[track.id]);

              return (
                <li key={track.id}>
                  <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface2">
                    <button
                      onClick={() => start(track)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="relative shrink-0">
                        <img
                          src={track.cover_big}
                          alt=""
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
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[13px] ${
                            active ? "text-accent" : ""
                          }`}
                        >
                          {track.title}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {track.artist}
                        </span>
                      </span>
                    </button>

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
        </div>
      )}
    </section>
  );
}
