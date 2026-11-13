import { useEffect, useRef, useState } from "react";

import { audioElement, streamSource, warmTrack } from "@/lib/audio";
import { usePlayer, type Track } from "@/store/playerStore";

type Options = {
  restoring: React.MutableRefObject<boolean>;
  pendingSeek: React.MutableRefObject<number>;
  onFailure: () => void;
  onLoaded: () => void;
};

async function loadTrack(
  id: string,
  signal: AbortSignal,
  onProgress: (value: number) => void,
) {
  const start = await fetch(`/api/download/${id}`, { method: "POST", signal });

  if (start.status === 404) {
    const response = await fetch(streamSource(id), { signal });
    if (!response.ok) throw new Error("stream");
    return response.blob();
  }

  if (!start.ok) throw new Error("download");

  const initial = await start.json();
  if (initial.state === "error") throw new Error(initial.error ?? "download");

  if (initial.state !== "done") {
    await new Promise<void>((resolve, reject) => {
      const source = new EventSource(`/api/download/${id}/events`);

      const close = (error?: Error) => {
        source.close();
        if (error) reject(error);
        else resolve();
      };

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.total > 0) {
            onProgress(Math.min(99, Math.round((data.bytes / data.total) * 100)));
          }

          if (data.state === "done") close();
          else if (data.state === "error") close(new Error(data.error ?? "download"));
        } catch (error) {
          return;
        }
      };

      source.onerror = () => close(new Error("download"));
      signal.addEventListener("abort", () => close(new Error("abort")), { once: true });
    });
  }

  onProgress(100);

  const response = await fetch(streamSource(id), { signal });
  if (!response.ok) throw new Error("stream");

  return response.blob();
}

export function useAudioEngine(track: Track | null, options: Options) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const objectURL = useRef("");
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
    const controller = new AbortController();
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

    loadTrack(track.id, controller.signal, setProgress)
      .then((blob) => {
        if (cancelled) return;

        const resumeAt = restoreAt > 0 ? restoreAt : audio.currentTime;

        if (objectURL.current) URL.revokeObjectURL(objectURL.current);

        const url = URL.createObjectURL(blob);
        objectURL.current = url;

        audio.src = url;
        audio.load();

        const apply = () => {
          if (resumeAt > 0) {
            audio.currentTime = resumeAt;
            setTime(resumeAt);
          }

          setDuration(audio.duration || track.duration || 0);
          setBuffering(false);
          ready.current = true;
          loaded.current();

          const state = usePlayer.getState();
          for (const item of state.queue.slice(state.index + 1, state.index + 4)) {
            warmTrack(item.id);
          }

          if (state.playing) {
            audio.play().catch(() => undefined);
          }
        };

        audio.addEventListener("loadedmetadata", apply, { once: true });
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;

        setBuffering(false);
        failure.current();
      });

    return () => {
      cancelled = true;
      controller.abort();
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

      if (media > 0 && full > 35 && media < 32 && !audio.src.startsWith("blob:")) {
        setDuration(full);
      } else {
        setDuration(media || full);
      }
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onError = () => {
      if (!ready.current) {
        setBuffering(true);
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
    progress,
    dragging,
    setDragging,
    seekTo,
  };
}
