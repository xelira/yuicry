"use client";

import { useState } from "react";
import { Heart, Play, Search as SearchIcon } from "lucide-react";

import AddToAlbum from "@/components/AddToAlbum";
import Equalizer from "@/components/Equalizer";
import { usePlayer } from "@/store/playerStore";
import { coverSource } from "@/lib/audio";

export default function Likes() {
  const liked = usePlayer((state) => state.liked);
  const playQueue = usePlayer((state) => state.playQueue);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const playing = usePlayer((state) => state.playing);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? liked.filter(
        (track) =>
          track.title.toLowerCase().includes(needle) ||
          track.artist.toLowerCase().includes(needle),
      )
    : liked;

  return (
    <section className="pt-8">
      <div className="flex items-end justify-between gap-6 pb-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight">Избранное</h1>
          <p className="mt-1 text-[12px] text-muted">
            {liked.length === 0 ? "Пока пусто" : `${liked.length} треков`}
          </p>
        </div>

        {liked.length > 0 && (
          <button
            onClick={() => playQueue(liked)}
            className="flex shrink-0 items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-[12px] font-medium text-accentText transition hover:brightness-110"
          >
            <Play size={13} fill="currentColor" />
            Играть все
          </button>
        )}
      </div>

      {liked.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-bg px-4 shadow-lift focus-within:border-lineStrong">
          <SearchIcon size={15} className="text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по избранному"
            className="h-11 w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
        </div>
      )}

      {needle && filtered.length === 0 && (
        <p className="mt-6 text-[13px] text-muted">Ничего не нашлось.</p>
      )}

      {liked.length === 0 ? (
        <p className="mt-8 max-w-[420px] text-[13px] leading-relaxed text-muted">
          Жми сердце в поиске или в плеере — трек останется здесь, даже после
          перезагрузки и на другом устройстве.
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-bg shadow-lift">
          <ul className="p-1.5">
            {filtered.map((track) => {
              const active = current?.id === track.id;

              return (
                <li key={track.id}>
                  <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface2">
                    <button
                      onClick={() => playQueue(filtered, filtered.indexOf(track))}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="relative shrink-0">
                        <img
                          src={coverSource(track.cover_big, "small")}
                          alt=""
                          className="h-10 w-10 rounded-md border border-line object-cover"
                        />

                        {active && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60">
                            <Equalizer active={playing} />
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

                    <AddToAlbum track={track} />

                    <button
                      onClick={() => void toggleLike(track)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-accent"
                      aria-label="Убрать из избранного"
                    >
                      <Heart size={15} fill="currentColor" />
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
