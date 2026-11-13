"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Disc3, Play, Plus, Trash2, X } from "lucide-react";

import { usePlayer, type Track } from "@/store/playerStore";

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
          Все альбомы
        </button>

        <div className="mt-4 flex items-end justify-between gap-4 border-b border-line pb-4">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-medium tracking-tight">{open.title}</h1>
            <p className="mt-1 text-[12px] text-muted">{tracks.length} треков</p>
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
              aria-label="Удалить альбом"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

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
                      src={track.cover_big}
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
      <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
        <h1 className="text-[22px] font-medium tracking-tight">Альбомы</h1>

        <div className="flex items-center gap-1">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
            placeholder="Название альбома"
            className="h-9 w-44 rounded-md border border-line bg-surface px-3 text-[12px] outline-none focus:border-lineStrong"
          />
          <button
            onClick={() => void create()}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accentText hover:brightness-110"
            aria-label="Создать альбом"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {albums.length === 0 ? (
        <p className="mt-8 max-w-[420px] text-[13px] leading-relaxed text-muted">
          Альбомов пока нет. Создай первый и добавляй треки из поиска кнопкой «+».
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {albums.map((album) => (
            <button
              key={album.id}
              onClick={() => void openAlbum(album)}
              className="group text-left"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-surface2">
                {album.cover ? (
                  <img
                    src={album.cover}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <Disc3 size={28} />
                  </span>
                )}
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
