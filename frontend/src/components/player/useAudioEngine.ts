import { useEffect, useRef, useState } from "react";

import { audioElement, streamSource, warmTrack } from "@/lib/audio";
import { usePlayer, type Track } from "@/store/playerStore";

type Options = {
  restoring: React.MutableRefObject<boolean>;
  pendingSeek: React.MutableRefObject<number>;
  onFailure: () => void;
  onLoaded: () => void;
};

export function useAudioEngine(track: Track | null, options: Options) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const ready = useRef(false);
  const failure = useRef(options.onFailure);
  const loaded = useRef(options.onLoaded);

  const playing = usePlayer((state) => state.playing);
  const rate = usePlayer((state) => state.rate);

  failure.current = options.onFailure;
  loaded.current = options.onLoaded;

  useEffect(() => {
    if (!track) return;

    const audio = audioElement();
    let cancelled = false;

    const restoreAt =
      options.restoring.current && options.pendingSeek.current > 0
        ? options.pendingSeek.current
        : 0;

    options.pendingSeek.current = 0;
    options.restoring.current = false;

    ready.current = false;
    setTime(0);
    setDuration(track.duration || 0);
    setBuffering(true);
    setProgress(0);

    audio.pause();
    audio.src = streamSource(track.id);
    audio.load();

    const apply = () => {
      if (cancelled) return;

      if (restoreAt > 0) {
        audio.currentTime = restoreAt;
        setTime(restoreAt);
      }

      setDuration(audio.duration || track.duration || 0);
      ready.current = true;
      loaded.current();

      const state = usePlayer.getState();
      for (const item of state.queue.slice(state.index + 1, state.index + 2)) {
        warmTrack(item.id);
      }

      if (state.playing) {
        audio.play().catch(() => undefined);
      }
    };

    audio.addEventListener("loadedmetadata", apply, { once: true });

    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", apply);
    };
  }, [track?.id]);

  useEffect(() => {
    const audio = audioElement();
    if (!track) return;

    if (playing) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [track?.id, playing]);

  useEffect(() => {
    const audio = audioElement();

    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => {
      const media = audio.duration || 0;
      const state = usePlayer.getState();
      const current = state.queue[state.index];
      const full = current?.duration || 0;

      setDuration(media || full);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onProgress = () => {
      if (!audio.duration) return;

      try {
        const ranges = audio.buffered;
        if (ranges.length > 0) {
          setProgress(Math.min(100, (ranges.end(ranges.length - 1) / audio.duration) * 100));
        }
      } catch (error) {
        return;
      }
    };
    const onError = () => {
      if (!ready.current) {
        setBuffering(true);
        failure.current();
        return;
      }

      setBuffering(false);
      failure.current();
    };

    const onEnded = () => {
      if (!ready.current) {
        setBuffering(true);
        return;
      }

      const state = usePlayer.getState();

      if (state.repeat === "one") {
        audio.currentTime = 0;
        void audio.play();
        return;
      }

      if (state.index + 1 >= state.queue.length) {
        if (state.repeat === "all") {
          state.jump(0);
          return;
        }
        state.setPlaying(false);
        return;
      }

      state.next();
      void state.ensureQueue();
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("timeupdate", onProgress);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("canplay", onPlaying);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("timeupdate", onProgress);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("canplay", onPlaying);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioElement();
    audio.playbackRate = rate;
    audio.preservesPitch = rate >= 1;
  }, [rate]);

  const seekTo = (seconds: number) => {
    const audio = audioElement();
    if (!Number.isFinite(seconds) || seconds < 0) return;

    usePlayer.getState().setFollowing(false);
    audio.currentTime = seconds;
    setTime(seconds);
  };

  return {
    time,
    duration,
    buffering,
    progress,
    dragging,
    setDragging,
    seekTo,
  };
}
