import { useEffect, useRef, useState } from "react";

import { audioElement, warmTrack } from "@/lib/audio";
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
  const [dragging, setDragging] = useState(false);

  const objectURL = useRef("");
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

    setTime(0);
    setDuration(track.duration || 0);
    setBuffering(true);

    fetch(`/api/stream/${track.id}`)
      .then((response) => {
        if (!response.ok) throw new Error("stream");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;

        if (objectURL.current) URL.revokeObjectURL(objectURL.current);

        const url = URL.createObjectURL(blob);
        objectURL.current = url;

        audio.src = url;
        audio.load();

        const apply = () => {
          if (restoreAt > 0) {
            audio.currentTime = restoreAt;
            setTime(restoreAt);
          }

          setDuration(audio.duration || track.duration || 0);
          setBuffering(false);
          loaded.current();

          if (usePlayer.getState().playing) {
            audio.play().catch(() => undefined);
          }
        };

        audio.addEventListener("loadedmetadata", apply, { once: true });
      })
      .catch(() => {
        if (cancelled) return;

        setBuffering(false);
        failure.current();
      });

    const state = usePlayer.getState();
    const upcoming = state.queue[state.index + 1];
    if (upcoming) warmTrack(upcoming.id);

    return () => {
      cancelled = true;
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
    const onMeta = () => setDuration(audio.duration || 0);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onError = () => {
      setBuffering(false);
      failure.current();
    };

    const onEnded = () => {
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
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("canplay", onPlaying);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
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

  useEffect(() => {
    return () => {
      if (objectURL.current) {
        URL.revokeObjectURL(objectURL.current);
        objectURL.current = "";
      }
    };
  }, []);

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
    dragging,
    setDragging,
    seekTo,
  };
}
