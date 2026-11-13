"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";

import LikeButton from "@/components/LikeButton";
import { CardSkeleton, Skeleton, TrackSkeleton } from "@/components/Skeleton";
import { coverSource } from "@/lib/audio";
import { useLongPressDrag } from "@/lib/useLongPressDrag";
import { useNav } from "@/store/navStore";
import { usePlayer, type Track } from "@/store/playerStore";

type Artist = {
  id: string;
  name: string;
  picture: string;
  fans: number;
  albums: number;
};

type AlbumCard = {
  id: string;
  title: string;
  cover: string;
  artist: string;
  artist_id: string;
  year: number;
  type: string;
  count: number;
};

type Album = AlbumCard & {
  tracks: Track[];
};

type RelatedArtist = {
  id: string;
  name: string;
  picture: string;
};

function formatFans(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} тыс.`;
  return String(value);
}

function formatType(value: string) {
  if (value === "single") return "Сингл";
  if (value === "ep") return "EP";
  if (value === "album") return "Альбом";
  return "";
}

function AlbumGrid({
  albums,
  onOpen,
}: {
  albums: AlbumCard[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {albums.map((album) => (
        <button key={album.id} onClick={() => onOpen(album.id)} className="group text-left">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface2">
            {album.cover ? (
              <img
                src={coverSource(album.cover, "large")}
                alt=""
                width={300}
                height={300}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[20px] text-muted">
                {album.title.slice(0, 1)}
              </div>
            )}

            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accentText shadow-[0_0_24px_-10px_var(--accent)]">
                <Play size={15} fill="currentColor" className="ml-0.5" />
              </span>
            </span>
          </div>

          <div className="aurora-text">
            <p className="mt-2 truncate text-[13px] font-medium">{album.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {[album.year || null, formatType(album.type)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function RelatedArtists({
  artists,
  onOpen,
}: {
  artists: RelatedArtist[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="aurora-text custom-scroll flex gap-4 overflow-x-auto pb-2">
      {artists.map((artist) => (
        <button
          key={artist.id}
          onClick={() => onOpen(artist.id)}
          className="w-[104px] shrink-0 text-center"
        >
          <span className="relative block h-[104px] w-[104px] overflow-hidden rounded-full border border-line bg-surface2">
            {artist.picture ? (
              <img
                src={coverSource(artist.picture, "medium")}
                alt=""
                width={104}
                height={104}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-300 hover:scale-105"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[20px] text-muted">
                {artist.name.slice(0, 1)}
              </span>
            )}
          </span>
          <span className="mt-2 block truncate text-[12px]">{artist.name}</span>
        </button>
      ))}
    </div>
  );
}

function CatalogTrackRow({
  track,
  index,
  tracks,
  mode,
  onArtist,
  onAlbum,
}: {
  track: Track;
  index: number;
  tracks: Track[];
  mode: "artist" | "album";
  onArtist: (id: string) => void;
  onAlbum: (id: string) => void;
}) {
  const playQueue = usePlayer((state) => state.playQueue);
  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const hideTrack = usePlayer((state) => state.hideTrack);
  const [removed, setRemoved] = useState(false);

  const drag = useLongPressDrag({
    kind: "track",
    title: track.title,
    cover: track.cover_big,
    onDrop: () => {
      void hideTrack(track);
      setRemoved(true);
    },
  });

  if (removed) return null;

  const active = current?.id === track.id;

  return (
    <li>
      <div
        {...drag.handlers}
        className={`group flex select-none items-center gap-3 rounded-xl px-2 py-2 transition-all duration-300 hover:bg-surface2 ${
          drag.pressed ? "scale-[0.98] opacity-40" : ""
        }`}
      >
        <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted">
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
            className="h-10 w-10 rounded-md border border-line object-cover"
          />
          <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/50 group-hover:flex">
            <Play size={13} fill="currentColor" />
          </span>
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

          {mode === "artist" ? (
            track.album_id && track.album ? (
              <button
                onClick={() => onAlbum(track.album_id!)}
                className="block w-full truncate text-left text-[12px] text-muted hover:text-ink"
              >
                {track.album}
              </button>
            ) : (
              <span className="block truncate text-[12px] text-muted">{track.artist}</span>
            )
          ) : track.artist_id ? (
            <button
              onClick={() => onArtist(track.artist_id!)}
              className="block w-full truncate text-left text-[12px] text-muted hover:text-ink"
            >
              {track.artist}
            </button>
          ) : (
            <span className="block truncate text-[12px] text-muted">{track.artist}</span>
          )}
        </div>

        <span className="hidden text-[11px] tabular-nums text-muted sm:block">
          {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
        </span>

        <span className={`transition-opacity duration-200 ${drag.pressed ? "opacity-0" : ""}`}>
          <LikeButton track={track} />
        </span>
      </div>
    </li>
  );
}

function TrackList({
  tracks,
  mode,
  onArtist,
  onAlbum,
}: {
  tracks: Track[];
  mode: "artist" | "album";
  onArtist: (id: string) => void;
  onAlbum: (id: string) => void;
}) {
  return (
    <ul className="mt-1">
      {tracks.map((track, index) => (
        <CatalogTrackRow
          key={track.id}
          track={track}
          index={index}
          tracks={tracks}
          mode={mode}
          onArtist={onArtist}
          onAlbum={onAlbum}
        />
      ))}
    </ul>
  );
}

export default function CatalogView() {
  const catalog = useNav((state) => state.catalog);
  const close = useNav((state) => state.closeCatalog);
  const openArtist = useNav((state) => state.openArtist);
  const openAlbum = useNav((state) => state.openAlbum);

  const playQueue = usePlayer((state) => state.playQueue);

  const [artist, setArtist] = useState<Artist | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [albums, setAlbums] = useState<AlbumCard[]>([]);
  const [related, setRelated] = useState<RelatedArtist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [showAllAlbums, setShowAllAlbums] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!catalog) return;

    let alive = true;
    setLoading(true);
    setError("");
    setArtist(null);
    setAlbum(null);
    setAlbums([]);
    setRelated([]);
    setTracks([]);
    setShowAll(false);
    setShowAllAlbums(false);

    const url = catalog.kind === "artist" ? `/api/artist/${catalog.id}` : `/api/album/${catalog.id}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json();
      })
      .then((data) => {
        if (!alive) return;

        if (catalog.kind === "artist") {
          setArtist(data.artist);
          setTracks(data.tracks ?? []);
          setAlbums(data.albums ?? []);
          setRelated(data.related ?? []);
          return;
        }

        setAlbum(data.album);
        setTracks(data.album?.tracks ?? []);
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [catalog?.kind, catalog?.id]);

  if (!catalog) return null;

  const title = catalog.kind === "album" ? album?.title ?? "" : artist?.name ?? "";
  const cover = catalog.kind === "album" ? album?.cover ?? "" : artist?.picture ?? "";
  const popular = showAll ? tracks : tracks.slice(0, 10);
  const visibleAlbums = showAllAlbums ? albums : albums.slice(0, 8);

  return (
    <section className="pt-4">
      <div className="aurora-text">
        <button
          onClick={close}
          className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
        >
          <ArrowLeft size={14} />
          Назад
        </button>
      </div>

      {loading ? (
        <div className="mt-4">
          <div className="flex items-end gap-4 border-b border-line pb-5">
            <Skeleton className="h-32 w-32 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="aurora-text"><p className="mt-8 text-[13px] text-muted">{error}</p></div>
      ) : (
        <div className="animate-[fade-up_.45s_cubic-bezier(.22,1,.36,1)]">
          <div className="relative mt-4 overflow-hidden rounded-[28px] border border-line">
            {cover && (
              <img
                src={coverSource(cover, "large")}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
              />
            )}
            <div className="absolute inset-0 bg-bg/70" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent" />

            <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:p-6">
              {cover ? (
                <img
                  src={coverSource(cover, "large")}
                  alt=""
                  width={160}
                  height={160}
                  className="h-32 w-32 shrink-0 rounded-2xl border border-line object-cover shadow-2xl sm:h-40 sm:w-40"
                />
              ) : (
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface2 text-[28px] font-medium text-muted sm:h-40 sm:w-40">
                  {title.slice(0, 1)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                  {catalog.kind === "album" ? "Альбом" : "Исполнитель"}
                </p>
                <h1 className="mt-1 line-clamp-2 break-words text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px]">
                  {title}
                </h1>

                {album ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    <button
                      onClick={() => openArtist(album.artist_id)}
                      className="hover:text-ink"
                    >
                      {album.artist}
                    </button>
                    <span className="text-lineStrong">·</span>
                    <span>
                      {[album.year || null, formatType(album.type), `${tracks.length} треков`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-muted">
                    {artist?.fans ? `${formatFans(artist.fans)} слушателей` : "Исполнитель"}
                    {artist?.albums ? ` · ${artist.albums} альбомов` : ""}
                  </p>
                )}
              </div>

              {tracks.length > 0 && (
                <button
                  onClick={() => playQueue(tracks)}
                  className="flex w-fit shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[12px] font-medium text-accentText transition hover:brightness-110"
                >
                  <Play size={14} fill="currentColor" />
                  Играть
                </button>
              )}
            </div>
          </div>

          <div className="mt-8">
            <div className="aurora-text flex items-end justify-between pb-3">
              <h2 className="text-[16px] font-medium tracking-tight">
                {catalog.kind === "artist" ? "Популярные треки" : "Треки"}
              </h2>
              {catalog.kind === "artist" && tracks.length > 10 && (
                <button
                  onClick={() => setShowAll((value) => !value)}
                  className="rounded-full border border-line bg-bg/70 px-3 py-1 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
                >
                  {showAll ? "Свернуть" : `Все ${tracks.length}`}
                </button>
              )}
            </div>

            {tracks.length === 0 ? (
              <div className="aurora-text"><p className="mt-3 text-[13px] text-muted">Здесь пока нет треков.</p></div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-bg/80 p-1.5 shadow-lift">
                <TrackList
                  tracks={catalog.kind === "artist" ? popular : tracks}
                  mode={catalog.kind}
                  onArtist={openArtist}
                  onAlbum={openAlbum}
                />
              </div>
            )}
          </div>

          {catalog.kind === "artist" && albums.length > 0 && (
            <div className="mt-8">
              <div className="aurora-text flex items-end justify-between pb-3">
                <h2 className="text-[16px] font-medium tracking-tight">Альбомы</h2>
                {albums.length > 8 ? (
                  <button
                    onClick={() => setShowAllAlbums((value) => !value)}
                    className="text-[11px] text-muted hover:text-ink"
                  >
                    {showAllAlbums ? "Свернуть" : `Все ${albums.length}`}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted">{albums.length}</span>
                )}
              </div>
              <AlbumGrid albums={visibleAlbums} onOpen={openAlbum} />
            </div>
          )}

          {catalog.kind === "artist" && related.length > 0 && (
            <div className="mt-8">
              <h2 className="aurora-text pb-3 text-[16px] font-medium tracking-tight">
                Похожие исполнители
              </h2>
              <RelatedArtists artists={related} onOpen={openArtist} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
