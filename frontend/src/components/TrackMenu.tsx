"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AudioWaveform,
  Check,
  ChevronDown,
  ChevronLeft,
  Disc3,
  MoreVertical,
  Plus,
  Share2,
  ThumbsDown,
} from "lucide-react";

import { SimilarIcon } from "@/components/icons";
import { usePlayer, type Track } from "@/store/playerStore";
import { coverSource } from "@/lib/audio";
import { shareLink } from "@/lib/share";
import { playWave } from "@/lib/wave";

type Album = {
  id: string;
  title: string;
};

type Props = {
  track: Track;
  liked: boolean;
  onSimilar: () => void;
  onDislike: () => void;
};

export default function TrackMenu({ track, liked, onSimilar, onDislike }: Props) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [title, setTitle] = useState("");
  const [added, setAdded] = useState(false);
  const [shared, setShared] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(
    null,
  );

  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const jump = usePlayer((state) => state.jump);

  const upcoming = queue.slice(index + 1);
  const visible = expanded ? upcoming : upcoming.slice(0, 4);
  const hidden = upcoming.length - visible.length;

  useEffect(() => {
    if (!open) return;

    fetch("/api/albums")
      .then((response) => (response.ok ? response.json() : { albums: [] }))
      .then((data) => setAlbums(data.albums ?? []))
      .catch(() => setAlbums([]));
  }, [open]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || menu.current?.contains(target)) return;

      setOpen(false);
      setExpanded(false);
      setAdded(false);
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggle = () => {
    if (open) {
      setOpen(false);
      setExpanded(false);
      return;
    }

    const button = box.current?.getBoundingClientRect();
    if (!button) return;

    const right = window.innerWidth - button.right;

    if (button.top > 380) {
      setPosition({ bottom: window.innerHeight - button.top + 10, right });
    } else {
      setPosition({ top: button.bottom + 10, right });
    }

    setOpen(true);
  };

  const add = async (albumID: string) => {
    const response = await fetch(`/api/albums/${albumID}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        cover_big: track.cover_big,
        artist_id: track.artist_id ?? "",
        album: track.album ?? "",
        album_id: track.album_id ?? "",
        duration: track.duration,
      }),
    });

    if (!response.ok) return;

    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      setOpen(false);
    }, 600);
  };

  const share = async () => {
    const done = await shareLink(`${track.artist} — ${track.title}`, `/t/${track.id}`);
    if (!done) return;

    setShared(true);
    setTimeout(() => setShared(false), 1500);
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

  const panel = open && position && (
    <div
      ref={menu}
      style={{ position: "fixed", width: 300, ...position }}
      className="z-[60] rounded-2xl border border-line bg-surface p-2 shadow-lift"
    >
      <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Трек</p>
        <button
          onClick={() => {
            setOpen(false);
            setExpanded(false);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface2 hover:text-ink"
          aria-label="Скрыть меню"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      <button
        onClick={() => {
          onSimilar();
          setOpen(false);
        }}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] text-ink transition-colors hover:bg-surface2"
      >
        <SimilarIcon size={15} />
        Похожие
      </button>

      <button
        onClick={() => {
          void playWave();
          setOpen(false);
        }}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] text-ink transition-colors hover:bg-surface2"
      >
        <AudioWaveform size={15} />
        Моя волна
      </button>

      {!liked && (
        <button
          onClick={() => {
            onDislike();
            setOpen(false);
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] text-ink transition-colors hover:bg-surface2"
        >
          <ThumbsDown size={15} />
          Не нравится
        </button>
      )}

      <button
        onClick={() => void share()}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] text-ink transition-colors hover:bg-surface2"
      >
        <Share2 size={15} />
        {shared ? "Ссылка скопирована" : "Поделиться"}
      </button>

      <div className="my-1.5 border-t border-line" />

      <p className="px-2.5 pb-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        В плейлист
      </p>

      <div className="custom-scroll max-h-36 overflow-auto">
        {albums.length === 0 ? (
          <p className="px-2.5 py-1.5 text-[12px] text-muted">Пока нет плейлистов</p>
        ) : (
          albums.map((album) => (
            <button
              key={album.id}
              onClick={() => void add(album.id)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-surface2"
            >
              <Disc3 size={14} className="shrink-0 text-muted" />
              <span className="truncate">{album.title}</span>
            </button>
          ))
        )}
      </div>

      <div className="mt-1.5 flex gap-1.5 px-1">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
          placeholder="Новый плейлист"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-[12px] text-ink outline-none transition-colors focus:border-lineStrong"
        />
        <button
          onClick={() => void create()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accentText transition hover:brightness-110"
          aria-label="Создать плейлист"
        >
          <Plus size={15} />
        </button>
      </div>

      {added && (
        <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted">
          <Check size={13} /> Добавлено
        </p>
      )}

      <div className="my-1.5 border-t border-line" />

      <div className="flex items-center justify-between px-2.5 pb-1.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Очередь</p>
        <span className="text-[10px] tabular-nums text-muted">{upcoming.length}</span>
      </div>

      {upcoming.length === 0 ? (
        <p className="px-2.5 pb-2 text-[12px] text-muted">Пусто</p>
      ) : (
        <div className="custom-scroll flex gap-1.5 overflow-x-auto px-1.5 pb-2">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                jump(queue.indexOf(item));
                setOpen(false);
              }}
              className="w-12 shrink-0 text-left"
            >
              <img
                src={coverSource(item.cover_big, "small")}
                alt=""
                className="h-12 w-12 rounded-xl border border-line object-cover"
              />
              <span className="mt-1 block truncate text-[10px] text-muted">
                {item.title}
              </span>
            </button>
          ))}

          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line text-[11px] tabular-nums text-muted transition-colors hover:border-lineStrong hover:text-ink"
            >
              +{hidden}
            </button>
          )}

          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-line text-muted transition-colors hover:border-lineStrong hover:text-ink"
              aria-label="Свернуть очередь"
            >
              <ChevronLeft size={16} />
              <span className="text-[9px]">свернуть</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
        aria-label="Ещё"
      >
        <MoreVertical size={18} />
      </button>

      {panel && createPortal(panel, document.body)}
    </div>
  );
}
