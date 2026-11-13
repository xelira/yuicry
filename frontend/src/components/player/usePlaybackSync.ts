import { useEffect, useRef } from "react";

import { audioElement, coverSource } from "@/lib/audio";
import { hostPlayback, hostStop } from "@/lib/host";
import { deviceId, pushPlayback, watchPlayback } from "@/lib/sync";
import { usePlayer, type Track } from "@/store/playerStore";

type Options = {
  seekTo: (seconds: number) => void;
};

export function usePlaybackSync(track: Track | null, options: Options) {
  const playing = usePlayer((state) => state.playing);
  const following = usePlayer((state) => state.following);
  const followSeek = usePlayer((state) => state.followSeek);
  const volume = usePlayer((state) => state.volume);
  const liked = usePlayer((state) => (track ? Boolean(state.likes[track.id]) : false));

  const seek = useRef(options.seekTo);
  seek.current = options.seekTo;

  useEffect(() => {
    audioElement().volume = following ? 0 : volume;
  }, [volume, following]);

  useEffect(() => {
    if (!track) return;

    const audio = audioElement();

    hostPlayback({
      title: track.title,
      artist: track.artist,
      cover: track.cover_big,
      playing,
      liked,
      position: audio.currentTime || 0,
      duration: audio.duration || track.duration || 0,
    });

    if (!usePlayer.getState().following) {
      void pushPlayback(track, audio.currentTime || 0, playing);
    }
  }, [track?.id, playing, liked]);

  useEffect(() => {
    if (!track || !playing) return;

    const timer = setInterval(() => {
      const audio = audioElement();

      hostPlayback({
        title: track.title,
        artist: track.artist,
        cover: track.cover_big,
        playing: true,
        liked,
        position: audio.currentTime || 0,
        duration: audio.duration || track.duration || 0,
      });
    }, 15000);

    return () => clearInterval(timer);
  }, [track?.id, playing, liked]);

  useEffect(() => {
    if (followSeek <= 0) return;

    const audio = audioElement();
    const apply = () => {
      audio.currentTime = followSeek;
    };

    if (audio.readyState >= 1) apply();
    else audio.addEventListener("loadedmetadata", apply, { once: true });
  }, [followSeek]);

  useEffect(() => {
    if (!track || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: track.cover_big
        ? [{ src: coverSource(track.cover_big, "large"), sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => usePlayer.getState().setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => usePlayer.getState().setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const state = usePlayer.getState();
      state.next();
      void state.ensureQueue();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => usePlayer.getState().previous());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek.current(details.seekTime);
    });
  }, [track?.id]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string | { command: string; position?: number }>).detail;
      const command = typeof detail === "string" ? detail : detail.command;
      const state = usePlayer.getState();

      if (command === "next") {
        state.next();
        void state.ensureQueue();
        return;
      }

      if (command === "previous") {
        state.previous();
        return;
      }

      if (command === "play") {
        state.setPlaying(true);
        return;
      }

      if (command === "pause") {
        state.setPlaying(false);
        return;
      }

      if (command === "like") {
        const current = state.queue[state.index];
        if (current) void state.toggleLike(current);
        return;
      }

      if (command === "seek") {
        const position = typeof detail === "string" ? 0 : detail.position ?? 0;
        if (Number.isFinite(position) && position >= 0) {
          seek.current(position);
        }
      }
    };

    window.addEventListener("yuicry:media", handler);
    return () => window.removeEventListener("yuicry:media", handler);
  }, []);

  useEffect(() => () => hostStop(), []);

  useEffect(() => {
    const timer = setInterval(() => {
      const state = usePlayer.getState();
      if (state.following || state.index < 0 || !state.playing) return;

      const current = state.queue[state.index];
      if (!current) return;

      void pushPlayback(current, audioElement().currentTime || 0, true);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return watchPlayback((remote) => {
      if (remote.device === deviceId()) return;

      const age = Date.now() / 1000 - remote.updated_at;
      if (!remote.playing || age > 15) return;

      const state = usePlayer.getState();
      const current = state.queue[state.index];
      const target = remote.position + age;
      const drift = Math.abs((audioElement().currentTime || 0) - target);

      if (current?.id !== remote.track.id || drift > 4) {
        state.follow(remote.track, target);
      }
    });
  }, []);
}
