import { create } from "zustand";

import { playTrack } from "@/lib/audio";

export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover_big: string;
  artist_id?: string;
  album?: string;
  album_id?: string;
};

export type Repeat = "off" | "all" | "one";

type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  rate: number;
  volume: number;
  repeat: Repeat;
  following: boolean;
  followSeek: number;
  fullscreen: boolean;
  lyricsOpen: boolean;
  likes: Record<string, boolean>;
  liked: Track[];
  hydrated: boolean;
  play: (track: Track) => void;
  playQueue: (tracks: Track[], start?: number) => void;
  jump: (index: number) => void;
  next: () => void;
  previous: () => void;
  toggle: () => void;
  setPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setRepeat: (repeat: Repeat) => void;
  follow: (track: Track, position: number) => void;
  setFollowing: (following: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setLyricsOpen: (lyricsOpen: boolean) => void;
  toggleLike: (track: Track) => Promise<void>;
  hideTrack: (track: Track) => Promise<void>;
  dislike: (track: Track) => Promise<void>;
  hydrate: () => Promise<void>;
  ensureQueue: () => Promise<void>;
};

function unique(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];

  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    result.push(track);
  }

  return result;
}

function payload(track: Track, kind: string) {
  return JSON.stringify({
    track_id: track.id,
    kind,
    title: track.title,
    artist: track.artist,
    cover_big: track.cover_big,
    duration: track.duration,
    artist_id: track.artist_id ?? "",
    album: track.album ?? "",
    album_id: track.album_id ?? "",
  });
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  playing: false,
  rate: 1,
  volume: 0.9,
  repeat: "off",
  following: false,
  followSeek: 0,
  fullscreen: false,
  lyricsOpen: false,
  likes: {},
  liked: [],
  hydrated: false,

  play: (track) => {
    playTrack(track.id);
    set({ queue: [track], index: 0, playing: true, following: false, followSeek: 0 });
  },

  playQueue: (tracks, start = 0) => {
    const queue = unique(tracks);
    if (queue.length === 0) return;
    const position = Math.min(start, queue.length - 1);
    playTrack(queue[position].id);
    set({ queue, index: position, playing: true, following: false, followSeek: 0 });
  },

  jump: (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    playTrack(queue[index].id);
    set({ index, playing: true, following: false, followSeek: 0 });
  },

  next: () => {
    const { queue, index } = get();
    if (index + 1 >= queue.length) return;
    playTrack(queue[index + 1].id);
    set({ index: index + 1, playing: true, following: false, followSeek: 0 });
  },

  previous: () => {
    const { queue, index } = get();
    if (index <= 0) return;
    playTrack(queue[index - 1].id);
    set({ index: index - 1, playing: true, following: false, followSeek: 0 });
  },

  toggle: () => set((state) => ({ playing: !state.playing, following: false, followSeek: 0 })),

  setPlaying: (playing) => set({ playing }),

  setRate: (rate) => set({ rate }),

  setVolume: (volume) => set({ volume }),

  setRepeat: (repeat) => set({ repeat }),

  follow: (track, position) => {
    set({
      queue: [track],
      index: 0,
      playing: true,
      following: true,
      followSeek: position + Math.random() * 0.01,
    });
  },

  setFollowing: (following) => set({ following, followSeek: 0 }),

  setFullscreen: (fullscreen) =>
    set(fullscreen ? { fullscreen } : { fullscreen, lyricsOpen: false }),

  setLyricsOpen: (lyricsOpen) => set({ lyricsOpen }),

  toggleLike: async (track) => {
    const liked = Boolean(get().likes[track.id]);

    set((state) => ({
      likes: { ...state.likes, [track.id]: !liked },
      liked: liked
        ? state.liked.filter((item) => item.id !== track.id)
        : [track, ...state.liked],
    }));

    await fetch("/api/reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload(track, liked ? "unlike" : "like"),
    }).catch(() => undefined);
  },

  hideTrack: async (track) => {
    set((state) => {
      const likes = { ...state.likes };
      delete likes[track.id];
      return {
        likes,
        liked: state.liked.filter((item) => item.id !== track.id),
      };
    });

    await fetch("/api/reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload(track, "dislike"),
    }).catch(() => undefined);
  },

  dislike: async (track) => {
    set((state) => {
      const likes = { ...state.likes };
      delete likes[track.id];
      return {
        likes,
        liked: state.liked.filter((item) => item.id !== track.id),
      };
    });

    await fetch("/api/reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload(track, "dislike"),
    }).catch(() => undefined);

    get().next();
  },

  hydrate: async () => {
    try {
      const response = await fetch("/api/likes");
      if (!response.ok) return;

      const data = await response.json();
      const tracks: Track[] = data.tracks ?? [];

      const likes: Record<string, boolean> = {};
      for (const track of tracks) {
        likes[track.id] = true;
      }

      set({ likes, liked: tracks });
    } finally {
      set({ hydrated: true });
    }
  },

  ensureQueue: async () => {
    const { queue, index } = get();
    if (queue.length - index > 3) return;

    const response = await fetch("/api/wave");
    if (!response.ok) return;

    const data = await response.json();
    const incoming: Track[] = data.tracks ?? [];

    set((state) => ({ queue: unique([...state.queue, ...incoming]) }));
  },
}));

export const currentTrack = (state: PlayerState) =>
  state.index >= 0 ? state.queue[state.index] ?? null : null;
