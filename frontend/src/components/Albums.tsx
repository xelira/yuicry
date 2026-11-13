"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Disc3, Pencil, Play, Plus, Trash2, X } from "lucide-react";

import { usePlayer, type Track } from "@/store/playerStore";
import { coverSource } from "@/lib/audio";

type Album = {
  id: string;
  title: string;
  count: number;
  cover: string;
};

export default function Albums() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [open, setOpen] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [title, setTitle] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);

  const playQueue = usePlayer((state) => state.playQueue);

  const load = async () => {
    const response = await fetch("/api/albums");
    if (!response.ok) return;
    const data = await response.json();
    setAlbums(data.albums ?? []);
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

  const create = async () => {
    const value = title.trim();
    if (!value) return;

    const response = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value }),
    });
    if (!response.ok) return;

    setTitle("");
    await load();
  };

  const removeAlbum = async () => {
    if (!open) return;
    await fetch(`/api/albums/${open.id}`, { method: "DELETE" });
    setOpen(null);
    setTracks([]);
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

  if (open) {
    return (
      <section className="pt-8">
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

        <div className="mt-4 flex items-end justify-between gap-4 border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setCoverOpen((value) => !value)}
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface2 text-muted hover:border-lineStrong"
              aria-label="Обложка плейлиста"
              aria-expanded={coverOpen}
            >
              {open.cover ? (
                <img src={coverSource(open.cover, "small")} alt="" className="h-full w-full object-cover" />
              ) : (
                <Disc3 size={20} />
              )}
            </button>

            <div className="min-w-0">
              {rename !== null ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTitle();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    autoFocus
                    value={rename}
                    onChange={(event) => setRename(event.target.value)}
                    className="h-9 w-full max-w-[240px] rounded-md border border-line bg-surface px-2 text-[15px] outline-none focus:border-lineStrong"
                    aria-label="Название плейлиста"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accentText"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => setRename(null)}
                    className="rounded-md border border-line px-2.5 py-1.5 text-[11px] text-muted hover:text-ink"
                  >
                    Отмена
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-[22px] font-medium tracking-tight">{open.title}</h1>
                  <button
                    onClick={() => setRename(open.title)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
                    aria-label="Переименовать плейлист"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
              <p className="mt-1 text-[12px] text-muted">{tracks.length} треков</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {tracks.length > 0 && (
              <button
                onClick={() => playQueue(tracks)}
                className="flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-[12px] font-medium text-accentText hover:brightness-110"
              >
                <Play size={13} fill="currentColor" />
                Играть
              </button>
            )}
            <button
              onClick={() => void removeAlbum()}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-muted hover:border-accent hover:text-accent"
              aria-label="Удалить плейлист"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {coverOpen && (
          <div className="mt-3 rounded-xl border border-line bg-bg p-2">
            {tracks.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted">Добавь треки, чтобы выбрать обложку.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => void saveCover(track.cover_big)}
                    className="h-12 w-12 overflow-hidden rounded-md border border-line hover:border-lineStrong"
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
                    className="flex h-12 items-center rounded-md border border-line px-2.5 text-[11px] text-muted hover:text-ink"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tracks.length === 0 ? (
          <p className="mt-8 text-[13px] text-muted">
            Пусто. Добавляй треки кнопкой «+» в поиске или в избранном.
          </p>
        ) : (
          <ul className="mt-3">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <div className="group flex items-center gap-3 border-b border-line px-2 py-2 hover:bg-surface2">
                  <button
                    onClick={() => playQueue(tracks, index)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <img
                      src={coverSource(track.cover_big, "small")}
                      alt=""
                      className="h-10 w-10 rounded border border-line object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{track.title}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {track.artist}
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => void removeTrack(track.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
                    aria-label="Убрать из альбома"
                  >
                    <X size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <p className="text-[12px] text-muted">
          {albums.length === 0 ? "Пока пусто" : `${albums.length} плейлистов`}
        </p>

        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
            placeholder="Название альбома"
            className="h-10 w-52 rounded-xl border border-line bg-bg px-3.5 text-[12px] outline-none transition-colors focus:border-lineStrong"
          />
          <button
            onClick={() => void create()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accentText transition hover:brightness-110"
            aria-label="Создать альбом"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {albums.length === 0 ? (
        <p className="mt-8 max-w-[420px] text-[13px] leading-relaxed text-muted">
          Плейлистов пока нет. Создай первый и добавляй треки из поиска кнопкой «+».
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {albums.map((album) => (
            <button
              key={album.id}
              onClick={() => void openAlbum(album)}
              className="group text-left"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface2">
                {album.cover ? (
                  <img
                    src={coverSource(album.cover, "large")}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <Disc3 size={26} />
                  </span>
                )}

                <span className="absolute inset-0 flex items-center justify-center bg-bg/0 opacity-0 transition group-hover:bg-bg/30 group-hover:opacity-100">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-bg">
                    <Play size={15} fill="currentColor" className="ml-0.5" />
                  </span>
                </span>
              </div>
              <p className="mt-2 truncate text-[13px]">{album.title}</p>
              <p className="text-[11px] text-muted">{album.count} треков</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
