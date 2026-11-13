"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Disc3,
  Image as ImageIcon,
  ListMusic,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { CardSkeleton } from "@/components/Skeleton";
import { coverSource } from "@/lib/audio";
import { pluralRu } from "@/lib/plural";
import { shareLink } from "@/lib/share";
import { useLongPressDrag } from "@/lib/useLongPressDrag";
import { useNav } from "@/store/navStore";
import { usePlayer, type Track } from "@/store/playerStore";

type Album = {
  id: string;
  title: string;
  count: number;
  cover: string;
};

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

function hashTitle(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }

  return Math.abs(hash);
}

function tracksLabel(count: number) {
  return `${count} ${pluralRu(count, "трек", "трека", "треков")}`;
}

function PlaylistArt({ album }: { album: Album }) {
  if (album.cover) {
    return (
      <img
        src={coverSource(album.cover, "large")}
        alt=""
        width={320}
        height={320}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
      />
    );
  }

  const seed = hashTitle(album.title);

  return (
    <span
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, var(--accent), #2b2350)",
        filter: `hue-rotate(${seed % 120 - 60}deg)`,
      }}
    >
      <span
        className="absolute inset-0 opacity-50"
        style={{
          background: "radial-gradient(120% 120% at 20% 0%, #ffffff55, transparent 55%)",
        }}
      />
      <span
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.045) 14px 15px)",
        }}
      />
      <span className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
      <span className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <span className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
      <Disc3 size={44} className="relative text-white/80 drop-shadow-[0_6px_18px_rgba(0,0,0,0.4)]" />
      <span className="absolute bottom-3 left-3 text-[9px] uppercase tracking-[0.18em] text-white/60">
        Плейлист
      </span>
    </span>
  );
}

function PlaylistCard({
  album,
  onOpen,
  onDelete,
}: {
  album: Album;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const drag = useLongPressDrag({
    kind: "playlist",
    title: album.title,
    cover: album.cover,
    onDrop: onDelete,
  });

  return (
    <button
      {...drag.handlers}
      draggable={false}
      onClick={() => {
        if (drag.consumeClick()) return;
        onOpen();
      }}
      className={`group select-none text-left transition-all duration-300 ${
        drag.pressed ? "scale-[0.97] opacity-40" : ""
      }`}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface2 shadow-lift transition-all duration-300 group-hover:-translate-y-1 group-hover:border-lineStrong group-hover:shadow-2xl">
        <PlaylistArt album={album} />

        <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <span className="absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-accent text-accentText opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <Play size={15} fill="currentColor" className="ml-0.5" />
        </span>

        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md">
          {tracksLabel(album.count)}
        </span>
      </div>

      <div className="aurora-text mt-3">
        <p className="truncate text-[14px] font-medium">{album.title}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {album.count === 0 ? "Добавь первый трек" : "Плейлист"}
        </p>
      </div>
    </button>
  );
}

function CreateCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-lineStrong/60 bg-bg/30 text-muted transition-colors hover:border-accent/60 hover:bg-accent/5 hover:text-ink"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface2 transition-colors group-hover:border-accent/40 group-hover:bg-accent/10 group-hover:text-accent">
        <Plus size={20} />
      </span>
      <span className="text-[12px] font-medium">Новый плейлист</span>
    </button>
  );
}

function PlaylistRow({
  track,
  tracks,
  index,
  onRemove,
}: {
  track: Track;
  tracks: Track[];
  index: number;
  onRemove: () => void;
}) {
  const playQueue = usePlayer((state) => state.playQueue);
  const openArtist = useNav((state) => state.openArtist);

  const drag = useLongPressDrag({
    kind: "track",
    title: track.title,
    cover: track.cover_big,
    onDrop: onRemove,
  });

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
          <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/50 group-hover:flex">
            <Play size={13} fill="currentColor" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => {
              if (drag.consumeClick()) return;
              playQueue(tracks, index);
            }}
            className="block w-full truncate text-left text-[13px]"
          >
            {track.title}
          </button>

          {track.artist_id ? (
            <button
              onClick={() => {
                if (drag.consumeClick()) return;
                openArtist(track.artist_id!);
              }}
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

        <button
          onClick={() => {
            if (drag.consumeClick()) return;
            onRemove();
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-md text-muted transition-all duration-200 hover:bg-surface hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 ${
            drag.pressed ? "opacity-0" : ""
          }`}
          aria-label="Убрать из альбома"
        >
          <X size={15} />
        </button>
      </div>
    </li>
  );
}

export default function Albums({ onExplore }: Props) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [open, setOpen] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [title, setTitle] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Album | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const playQueue = usePlayer((state) => state.playQueue);

  const load = async () => {
    try {
      const response = await fetch("/api/albums");
      if (!response.ok) return;
      const data = await response.json();
      setAlbums(data.albums ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openAlbum = async (album: Album) => {
    setOpen(album);
    const response = await fetch(`/api/albums/${album.id}`);
    if (!response.ok) return;
    const data = await response.json();
    setTracks(data.tracks ?? []);
  };

  useEffect(() => {
    if (!open) return;

    const scroller = document.querySelector(".overscroll-contain");
    scroller?.scrollTo({ top: 0, behavior: "auto" });
  }, [open?.id]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("playlist");
    if (!id || albums.length === 0) return;

    const album = albums.find((item) => item.id === id);
    if (album) void openAlbum(album);

    window.history.replaceState({}, "", "/");
  }, [albums]);

  const create = async () => {
    const value = title.trim();
    if (!value) return;

    const response = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value }),
    });
    if (!response.ok) return;

    const album: Album = await response.json();
    setTitle("");
    await load();
    void openAlbum(album);
  };

  const shareAlbum = async () => {
    if (!open) return;

    const done = await shareLink(open.title, `/p/${open.id}`);
    if (!done) return;

    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  const removeAlbum = async (album: Album) => {
    await fetch(`/api/albums/${album.id}`, { method: "DELETE" });

    if (open?.id === album.id) {
      setOpen(null);
      setTracks([]);
    }

    setConfirmDelete(null);
    await load();
  };

  const saveTitle = async () => {
    if (!open) return;

    const value = (rename ?? "").trim();
    if (!value) return;

    const response = await fetch(`/api/albums/${open.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value }),
    });
    if (!response.ok) return;

    setOpen({ ...open, title: value });
    setAlbums((items) => items.map((item) => (item.id === open.id ? { ...item, title: value } : item)));
    setRename(null);
  };

  const saveCover = async (cover: string) => {
    if (!open) return;

    const response = await fetch(`/api/albums/${open.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cover }),
    });
    if (!response.ok) return;

    setOpen({ ...open, cover });
    setAlbums((items) => items.map((item) => (item.id === open.id ? { ...item, cover } : item)));
    setCoverOpen(false);
  };

  const removeTrack = async (trackID: string) => {
    if (!open) return;
    await fetch(`/api/albums/${open.id}/tracks/${trackID}`, { method: "DELETE" });
    const next = tracks.filter((track) => track.id !== trackID);
    setTracks(next);
    await load();
  };

  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  const totalTracks = albums.reduce((sum, album) => sum + album.count, 0);

  if (open) {
    return (
      <section className="pt-4">
        <div className="aurora-text">
          <button
            onClick={() => {
              setOpen(null);
              setTracks([]);
            }}
            className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
          >
            <ArrowLeft size={14} />
            Все плейлисты
          </button>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-[28px] border border-line bg-bg/70 shadow-lift">
          {open.cover && (
            <img
              src={coverSource(open.cover, "large")}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 120% at 15% 0%, rgb(var(--accent-rgb) / 0.16), transparent 60%)",
            }}
          />

          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:p-6">
            <button
              onClick={() => setCoverOpen((value) => !value)}
              className="group relative h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface2 shadow-2xl sm:h-40 sm:w-40"
              aria-label="Обложка плейлиста"
              aria-expanded={coverOpen}
            >
              <PlaylistArt album={open} />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white/0 transition-colors group-hover:bg-black/40 group-hover:text-white">
                <ImageIcon size={18} />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Плейлист</p>

              <div className="mt-1 flex items-center gap-2">
                {rename !== null ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveTitle();
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      autoFocus
                      value={rename}
                      onChange={(event) => setRename(event.target.value)}
                      className="h-10 w-full max-w-[280px] rounded-xl border border-line bg-surface px-3 text-[18px] outline-none focus:border-lineStrong"
                      aria-label="Название плейлиста"
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-accentText"
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => setRename(null)}
                      className="rounded-full border border-line px-3 py-1.5 text-[11px] text-muted hover:text-ink"
                    >
                      Отмена
                    </button>
                  </form>
                ) : (
                  <>
                    <h1 className="truncate text-[clamp(24px,4vw,38px)] font-semibold tracking-tight">
                      {open.title}
                    </h1>
                    <button
                      onClick={() => setRename(open.title)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
                      aria-label="Переименовать плейлист"
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>

              <p className="mt-2 text-[12px] text-muted">
                {shared
                  ? "Ссылка скопирована"
                  : `${tracksLabel(tracks.length)}${
                      totalDuration > 0 ? ` · ${formatTotal(totalDuration)}` : ""
                    }`}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {tracks.length > 0 && (
                  <button
                    onClick={() => playQueue(tracks)}
                    className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[12px] font-medium text-accentText shadow-[0_0_28px_-12px_var(--accent)] transition hover:brightness-110"
                  >
                    <Play size={14} fill="currentColor" />
                    Играть
                  </button>
                )}

                <button
                  onClick={() => void shareAlbum()}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-lineStrong hover:text-ink"
                  aria-label="Поделиться плейлистом"
                >
                  <Share2 size={15} />
                </button>

                <button
                  onClick={() => setConfirmDelete(open)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-accent"
                  aria-label="Удалить плейлист"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {coverOpen && (
          <div className="mt-3 rounded-2xl border border-line bg-bg/80 p-3">
            <p className="px-1 pb-2 text-[10px] uppercase tracking-[0.14em] text-muted">
              Обложка из треков
            </p>

            {tracks.length === 0 ? (
              <p className="px-1 py-2 text-[12px] text-muted">Добавь треки, чтобы выбрать обложку.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => void saveCover(track.cover_big)}
                    className={`h-14 w-14 overflow-hidden rounded-xl border transition-colors ${
                      open.cover === track.cover_big
                        ? "border-accent ring-2 ring-accent/40"
                        : "border-line hover:border-lineStrong"
                    }`}
                    aria-label={`Обложка: ${track.title}`}
                  >
                    <img
                      src={coverSource(track.cover_big, "small")}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}

                {open.cover && (
                  <button
                    onClick={() => void saveCover("")}
                    className="flex h-14 items-center rounded-xl border border-line px-3 text-[11px] text-muted hover:text-ink"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tracks.length === 0 ? (
          <div className="relative mt-4 overflow-hidden rounded-[28px] border border-line bg-bg/70 p-8 text-center">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 120% at 50% 0%, rgb(var(--accent-rgb) / 0.16), transparent 60%)",
              }}
            />
            <div className="relative flex flex-col items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-accent">
                <ListMusic size={22} />
              </span>
              <h2 className="text-[18px] font-medium tracking-tight">Плейлист пуст</h2>
              <p className="max-w-[380px] text-[12px] leading-relaxed text-muted">
                Добавляй треки кнопкой «+» в поиске или в избранном — они появятся здесь.
              </p>
              <button
                onClick={onExplore}
                className="mt-1 rounded-full bg-accent px-4 py-2 text-[12px] font-medium text-accentText transition hover:brightness-110"
              >
                Найти треки
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 flex items-end justify-between gap-4 pb-3">
              <div className="aurora-text">
                <h2 className="text-[16px] font-medium tracking-tight">Треки</h2>
                <p className="text-[11px] text-muted">{tracksLabel(tracks.length)}</p>
              </div>
              {totalDuration > 0 && (
                <span className="text-[11px] tabular-nums text-muted">
                  {formatTotal(totalDuration)}
                </span>
              )}
            </div>

            <ul className="overflow-hidden rounded-2xl border border-line bg-bg/80 p-1.5">
              {tracks.map((track, index) => (
                <PlaylistRow
                  key={track.id}
                  track={track}
                  tracks={tracks}
                  index={index}
                  onRemove={() => void removeTrack(track.id)}
                />
              ))}
            </ul>
          </>
        )}

        <ConfirmDialog
          open={Boolean(confirmDelete)}
          title="Удалить плейлист?"
          text={`«${confirmDelete?.title ?? ""}» и все треки в нём исчезнут.`}
          onConfirm={() => {
            if (confirmDelete) void removeAlbum(confirmDelete);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      </section>
    );
  }

  return (
    <section className="pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div className="aurora-text">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Коллекция</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Плейлисты</h1>
          <p className="mt-1 text-[12px] text-muted">
            {albums.length === 0
              ? "Пока пусто"
              : `${albums.length} ${pluralRu(albums.length, "плейлист", "плейлиста", "плейлистов")}${
                  totalTracks > 0 ? ` · ${tracksLabel(totalTracks)}` : ""
                }`}
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          className="flex w-full items-center gap-2 sm:w-auto"
        >
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Название плейлиста"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg/70 px-4 text-[12px] outline-none transition-colors placeholder:text-muted focus:border-lineStrong sm:w-56 sm:flex-none"
          />
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-medium text-accentText shadow-[0_0_24px_-12px_var(--accent)] transition hover:brightness-110"
          >
            <Plus size={15} />
            Создать
          </button>
        </form>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : albums.length === 0 ? (
        <div className="relative overflow-hidden rounded-[28px] border border-line bg-bg/70 p-8">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 120% at 15% 0%, rgb(var(--accent-rgb) / 0.18), transparent 55%)",
            }}
          />
          <div className="absolute -right-8 top-1/2 hidden -translate-y-1/2 sm:block">
            <div className="h-28 w-28 rotate-6 rounded-2xl border border-white/10 bg-gradient-to-br from-accent/60 to-[#2b2350]/60" />
            <div className="absolute -left-10 top-8 h-28 w-28 -rotate-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#14b8a6]/40 to-accent/30" />
          </div>

          <div className="relative flex max-w-[480px] flex-col items-start gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-accent">
              <ListMusic size={22} />
            </span>
            <h2 className="text-[20px] font-medium tracking-tight">Собери свою коллекцию</h2>
            <p className="text-[13px] leading-relaxed text-muted">
              Создай плейлист и добавляй треки из поиска кнопкой «+».
            </p>
            <button
              onClick={() => inputRef.current?.focus()}
              className="mt-1 rounded-full bg-accent px-4 py-2 text-[12px] font-medium text-accentText transition hover:brightness-110"
            >
              Создать плейлист
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {albums.map((album) => (
            <PlaylistCard
              key={album.id}
              album={album}
              onOpen={() => void openAlbum(album)}
              onDelete={() => setConfirmDelete(album)}
            />
          ))}
          <CreateCard onClick={() => inputRef.current?.focus()} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить плейлист?"
        text={`«${confirmDelete?.title ?? ""}» и все треки в нём исчезнут.`}
        onConfirm={() => {
          if (confirmDelete) void removeAlbum(confirmDelete);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}
