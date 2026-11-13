"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { type Track } from "@/store/playerStore";

type Album = {
  id: string;
  title: string;
};

export default function AddToAlbum({ track }: { track: Track }) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState(false);

  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    fetch("/api/albums")
      .then((response) => (response.ok ? response.json() : { albums: [] }))
      .then((data) => setAlbums(data.albums ?? []))
      .catch(() => setAlbums([]));
  }, [open]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const add = async (albumID: string) => {
    const response = await fetch(`/api/albums/${albumID}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        cover_big: track.cover_big,
        duration: track.duration,
      }),
    });

    if (!response.ok) return;

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 600);
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

    const album: Album = await response.json();
    setTitle("");
    await add(album.id);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
        aria-label="Добавить в плейлист"
      >
        <Plus size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-lg border border-line bg-surface p-2 shadow-lift">
          {saved ? (
            <p className="px-2 py-3 text-[12px] text-muted">Добавлено</p>
          ) : (
            <>
              <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-[0.12em] text-muted">
                В плейлист
              </p>

              <div className="max-h-52 overflow-auto">
                {albums.length === 0 ? (
                  <p className="px-2 py-2 text-[12px] text-muted">Пока нет альбомов</p>
                ) : (
                  albums.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => void add(album.id)}
                      className="block w-full truncate rounded px-2 py-1.5 text-left text-[12px] hover:bg-surface2"
                    >
                      {album.title}
                    </button>
                  ))
                )}
              </div>

              <div className="mt-2 flex gap-1 border-t border-line pt-2">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void create();
                  }}
                  placeholder="Новый плейлист"
                  className="h-8 min-w-0 flex-1 rounded border border-line bg-bg px-2 text-[12px] outline-none focus:border-lineStrong"
                />
                <button
                  onClick={() => void create()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent text-accentText"
                  aria-label="Создать плейлист"
                >
                  <Plus size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
