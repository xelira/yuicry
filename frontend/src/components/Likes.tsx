"use client";

import { useState } from "react";
import { Heart, Play, Search as SearchIcon, Shuffle, X } from "lucide-react";

import AddToAlbum from "@/components/AddToAlbum";
import Equalizer from "@/components/Equalizer";
import { Skeleton, TrackSkeleton } from "@/components/Skeleton";
import { coverSource } from "@/lib/audio";
import { pluralRu } from "@/lib/plural";
import { useLongPressDrag } from "@/lib/useLongPressDrag";
import { useNav } from "@/store/navStore";
import { usePlayer, type Track } from "@/store/playerStore";

type Props = {
  onExplore: () => void;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTotal(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}

function tracksLabel(count: number) {
  return `${count} ${pluralRu(count, "трек", "трека", "треков")}`;
}

function LikedRow({ track, tracks, index }: { track: Track; tracks: Track[]; index: number }) {
  const playQueue = usePlayer((state) => state.playQueue);
  const openArtist = useNav((state) => state.openArtist);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const playing = usePlayer((state) => state.playing);

  const drag = useLongPressDrag({
    kind: "track",
    title: track.title,
    cover: track.cover_big,
    onDrop: () => void toggleLike(track),
  });

  const active = current?.id === track.id;

  return (
    <li>
      <div
        {...drag.handlers}
        className={`group flex select-none items-center gap-3 rounded-xl px-2 py-2 transition-all duration-300 hover:bg-surface2 ${
          drag.pressed ? "scale-[0.98] opacity-40" : ""
        }`}
      >
        <span className="hidden w-5 shrink-0 text-right text-[11px] tabular-nums text-muted sm:block">
          {index + 1}
        </span>

        <button
          onClick={() => {
            if (drag.consumeClick()) return;
            playQueue(tracks, index);
          }}
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
            className="h-10 w-10 rounded-lg border border-line object-cover"
          />

          {active ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
              <Equalizer active={playing} />
            </span>
          ) : (
            <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/50 group-hover:flex">
              <Play size={13} fill="currentColor" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => {
              if (drag.consumeClick()) return;
              playQueue(tracks, index);
            }}
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
            <span className="block truncate text-[12px] text-muted">{track.artist}</span>
          )}
        </div>

        <span className="hidden text-[11px] tabular-nums text-muted sm:block">
          {formatTime(track.duration)}
        </span>

        <AddToAlbum track={track} />

        <button
          onClick={() => void toggleLike(track)}
          className={`flex h-8 w-8 items-center justify-center rounded-md text-accent transition-all duration-200 hover:bg-surface ${
            drag.pressed ? "opacity-0" : ""
          }`}
          aria-label="Убрать из избранного"
          aria-pressed
        >
          <Heart size={15} fill="currentColor" />
        </button>
      </div>
    </li>
  );
}

export default function Likes({ onExplore }: Props) {
  const liked = usePlayer((state) => state.liked);
  const hydrated = usePlayer((state) => state.hydrated);
  const playQueue = usePlayer((state) => state.playQueue);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? liked.filter(
        (track) =>
          track.title.toLowerCase().includes(needle) ||
          track.artist.toLowerCase().includes(needle),
      )
    : liked;

  const list = needle ? filtered : liked;
  const totalDuration = liked.reduce((sum, track) => sum + (track.duration || 0), 0);
  const covers = liked
    .slice(0, 4)
    .map((track) => track.cover_big)
    .filter(Boolean);

  const shuffle = () => {
    const copy = [...list];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[random]] = [copy[random], copy[index]];
    }

    playQueue(copy);
  };

  if (!hydrated) {
    return (
      <section className="pt-4">
        <Skeleton className="h-44 w-full rounded-[28px]" />
        <div className="mt-4 space-y-1 rounded-2xl border border-line bg-bg p-1.5 shadow-lift">
          {[0, 1, 2, 3, 4].map((index) => (
            <TrackSkeleton key={index} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="pt-4">
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-bg/70 shadow-lift">
        {liked[0]?.cover_big && (
          <img
            src={coverSource(liked[0].cover_big, "large")}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
          />
        )}

        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 120% at 15% 0%, rgb(var(--accent-rgb) / 0.18), transparent 60%)",
          }}
        />

        <div className="relative flex flex-wrap items-end justify-between gap-5 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <div className="grid h-20 w-20 grid-cols-2 gap-0.5 overflow-hidden rounded-2xl border border-line bg-surface2 shadow-xl">
                {Array.from({ length: 4 }).map((_, index) =>
                  covers[index] ? (
                    <img
                      key={index}
                      src={coverSource(covers[index], "small")}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      key={index}
                      className="bg-gradient-to-br from-accent/30 to-surface2"
                    />
                  ),
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-bg bg-accent text-accentText shadow-lg">
                <Heart size={13} fill="currentColor" />
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Коллекция</p>
              <h1 className="mt-1 text-[clamp(26px,4vw,38px)] font-semibold tracking-tight">
                Избранное
              </h1>
              <p className="mt-1 text-[12px] text-muted">
                {liked.length === 0
                  ? "Пока пусто"
                  : `${tracksLabel(liked.length)}${
                      totalDuration > 0 ? ` · ${formatTotal(totalDuration)}` : ""
                    }`}
              </p>
            </div>
          </div>

          {liked.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => playQueue(list)}
                className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[12px] font-medium text-accentText shadow-[0_0_28px_-12px_var(--accent)] transition hover:brightness-110"
              >
                <Play size={14} fill="currentColor" />
                Играть все
              </button>

              <button
                onClick={shuffle}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-lineStrong hover:text-ink"
                aria-label="Перемешать"
              >
                <Shuffle size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {liked.length > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-full border border-line bg-bg/70 px-4 shadow-lift transition-colors focus-within:border-lineStrong">
          <SearchIcon size={15} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по избранному"
            className="h-11 w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
              aria-label="Очистить поиск"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {liked.length === 0 ? (
        <div className="relative mt-4 overflow-hidden rounded-[28px] border border-line bg-bg/70 p-8">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 120% at 15% 0%, rgb(var(--accent-rgb) / 0.18), transparent 55%)",
            }}
          />
          <Heart
            size={180}
            className="pointer-events-none absolute -right-10 top-1/2 hidden -translate-y-1/2 text-accent/10 sm:block"
          />

          <div className="relative flex max-w-[480px] flex-col items-start gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-accent">
              <Heart size={22} />
            </span>
            <h2 className="text-[20px] font-medium tracking-tight">Собери избранное</h2>
            <p className="text-[13px] leading-relaxed text-muted">
              Жми сердце в поиске или в плеере — трек останется здесь, даже после
              перезагрузки и на другом устройстве.
            </p>
            <button
              onClick={onExplore}
              className="mt-1 rounded-full bg-accent px-4 py-2 text-[12px] font-medium text-accentText transition hover:brightness-110"
            >
              Собрать волну
            </button>
          </div>
        </div>
      ) : needle && filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-bg/70 p-8 text-center">
          <p className="text-[13px] text-muted">Ничего не нашлось.</p>
          <button
            onClick={() => setQuery("")}
            className="mt-3 rounded-full border border-line px-3.5 py-1.5 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
          >
            Сбросить поиск
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
              {needle ? "Результаты" : "Все треки"}
            </p>
            <p className="text-[11px] tabular-nums text-muted">{list.length}</p>
          </div>

          <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-bg/80 p-1.5 shadow-lift">
            <ul>
              {list.map((track, index) => (
                <LikedRow key={track.id} track={track} tracks={list} index={index} />
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
