"use client";

import { useEffect, useRef, useState } from "react";
import {
  Heart,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  ThumbsDown,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

import { SimilarIcon } from "@/components/icons";
import { attachAudio, audioElement, warmTrack } from "@/lib/audio";
import { deviceId, pullPlayback, pushPlayback } from "@/lib/sync";
import { hostPlaying } from "@/lib/host";
import { currentTrack, usePlayer } from "@/store/playerStore";

const presets = [1, 0.85, 1.2];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Player() {
  const barRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const pendingSeek = useRef(0);
  const restoring = useRef(false);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.9);

  const track = usePlayer(currentTrack);
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const rate = usePlayer((state) => state.rate);
  const volume = usePlayer((state) => state.volume);
  const repeat = usePlayer((state) => state.repeat);
  const following = usePlayer((state) => state.following);
  const followSeek = usePlayer((state) => state.followSeek);
  const liked = usePlayer((state) => (track ? Boolean(state.likes[track.id]) : false));

  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const setPlaying = usePlayer((state) => state.setPlaying);
  const setRate = usePlayer((state) => state.setRate);
  const setVolume = usePlayer((state) => state.setVolume);
  const setRepeat = usePlayer((state) => state.setRepeat);
  const setFollowing = usePlayer((state) => state.setFollowing);
  const setFullscreen = usePlayer((state) => state.setFullscreen);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const dislike = usePlayer((state) => state.dislike);
  const playQueue = usePlayer((state) => state.playQueue);
  const ensureQueue = usePlayer((state) => state.ensureQueue);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("yuicry:playback");
      if (!raw) return;

      const saved = JSON.parse(raw);
      if (!saved?.queue?.length) return;

      const position = Math.min(Math.max(saved.index ?? 0, 0), saved.queue.length - 1);
      restoring.current = true;
      pendingSeek.current = saved.time ?? 0;

      usePlayer.setState({
        queue: saved.queue,
        index: position,
        rate: saved.rate ?? 1,
        volume: saved.volume ?? 0.9,
        repeat: saved.repeat ?? "off",
      });
    } catch (error) {
      pendingSeek.current = 0;
    }
  }, []);

  useEffect(() => {
    const audio = audioElement();

    let last = 0;

    const save = () => {
      const state = usePlayer.getState();
      if (state.index < 0 || state.queue.length === 0) return;

      try {
        localStorage.setItem(
          "yuicry:playback",
          JSON.stringify({
            queue: state.queue,
            index: state.index,
            time: audio.currentTime || 0,
            rate: state.rate,
            volume: state.volume,
            repeat: state.repeat,
          }),
        );
      } catch (error) {
        return;
      }
    };

    const onTime = () => {
      const now = Date.now();
      if (now - last > 2000) {
        last = now;
        save();
      }
    };

    audio.addEventListener("timeupdate", onTime);
    window.addEventListener("pagehide", save);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      window.removeEventListener("pagehide", save);
    };
  }, []);

  useEffect(() => {
    const audio = audioElement();
    attachAudio(audio);

    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onError = () => {
      setBuffering(false);
      setPlaying(false);
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
    const close = (event: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(event.target as Node)) {
        setSpeedOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!track) return;

    const audio = audioElement();
    let cancelled = false;
    let objectURL = "";

    const restoreAt = restoring.current && pendingSeek.current > 0 ? pendingSeek.current : 0;
    pendingSeek.current = 0;
    restoring.current = false;

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

        objectURL = URL.createObjectURL(blob);
        audio.src = objectURL;
        audio.load();

        const apply = () => {
          if (restoreAt > 0) {
            audio.currentTime = restoreAt;
            setTime(restoreAt);
          }

          setDuration(audio.duration || track.duration || 0);
          setBuffering(false);

          if (usePlayer.getState().playing) {
            audio.play().catch(() => undefined);
          }
        };

        audio.addEventListener("loadedmetadata", apply, { once: true });
      })
      .catch(() => {
        if (cancelled) return;
        setBuffering(false);
        setPlaying(false);
      });

    const upcoming = queue[index + 1];
    if (upcoming) warmTrack(upcoming.id);

    return () => {
      cancelled = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
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
  }, [playing, track?.id]);

  useEffect(() => {
    audioElement().volume = following ? 0 : volume;
  }, [volume, following]);

  useEffect(() => {
    hostPlaying(Boolean(track) && playing);
  }, [playing, track?.id]);

  useEffect(() => () => hostPlaying(false), []);

  useEffect(() => {
    if (followSeek <= 0) return;

    const audio = audioElement();
    const apply = () => {
      audio.currentTime = followSeek;
      setTime(followSeek);
    };

    if (audio.readyState >= 1) apply();
    else audio.addEventListener("loadedmetadata", apply, { once: true });
  }, [followSeek]);

  useEffect(() => {
    const timer = setInterval(() => {
      const state = usePlayer.getState();
      if (state.following || state.index < 0) return;

      const current = state.queue[state.index];
      if (!current) return;

      void pushPlayback(current, audioElement().currentTime || 0, state.playing);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      const remote = await pullPlayback();
      if (stopped || !remote) return;
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
    };

    const timer = setInterval(() => void tick(), 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const audio = audioElement();
    audio.playbackRate = rate;
    audio.preservesPitch = rate >= 1;
  }, [rate]);

  useEffect(() => {
    document.title = track ? `${track.title} — ${track.artist}` : "yuicry";
  }, [track?.id]);

  useEffect(() => {
    return () => {
      document.title = "yuicry";
    };
  }, []);

  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: track.cover_big
        ? [{ src: track.cover_big, sizes: "500x500", type: "image/jpeg" }]
        : [],
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      next();
      void ensureQueue();
    });
    navigator.mediaSession.setActionHandler("previoustrack", previous);
  }, [track?.id]);

  const seek = (clientX: number) => {
    const bar = barRef.current;
    const audio = audioElement();
    if (!bar || !duration) return;

    setFollowing(false);

    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
    setTime(ratio * duration);
  };

  const mute = () => {
    if (volume > 0) {
      setLastVolume(volume);
      setVolume(0);
      return;
    }
    setVolume(lastVolume || 0.9);
  };

  const cycleRepeat = () => {
    if (repeat === "off") setRepeat("all");
    else if (repeat === "all") setRepeat("one");
    else setRepeat("off");
  };

  const playSimilar = async () => {
    if (!track) return;

    const response = await fetch(`/api/similar/${track.id}`);
    if (!response.ok) return;

    const data = await response.json();
    if (data.tracks?.length) playQueue(data.tracks);
  };

  if (!track) {
    return null;
  }

  const progress = duration > 0 ? Math.min(time / duration, 1) : 0;
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const playButton = (size: "mobile" | "desktop") => (
    <button
      onClick={toggle}
      className={`flex items-center justify-center rounded-full bg-ink text-bg transition hover:opacity-90 ${
        size === "mobile" ? "h-11 w-11" : "h-11 w-11"
      }`}
      aria-label={playing ? "Пауза" : "Играть"}
    >
      {buffering && playing ? (
        <Loader2 size={16} className="animate-spin" />
      ) : playing ? (
        <Pause size={15} fill="currentColor" />
      ) : (
        <Play size={15} fill="currentColor" className="ml-0.5" />
      )}
    </button>
  );

  return (
    <div className="fixed inset-x-0 bottom-[46px] z-30 overflow-hidden rounded-t-2xl border-x border-t border-line bg-surface shadow-[0_-10px_30px_rgba(0,0,0,0.18)] sm:bottom-0 sm:rounded-none sm:border-x-0">
      {following && (
        <div className="mx-auto flex max-w-[1280px] justify-center px-4 pt-2">
          <button
            onClick={() => setFollowing(false)}
            className="flex items-center gap-2 rounded-full border border-line bg-surface2 px-3 py-1 text-[11px] text-muted transition-colors hover:text-ink"
          >
            Звук выключен на этом устройстве · включить
          </button>
        </div>
      )}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div
          ref={barRef}
          role="slider"
          aria-label="Перемотка"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          className="group relative h-4 w-full cursor-pointer touch-none"
          onPointerDown={(event) => {
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            seek(event.clientX);
          }}
          onPointerMove={(event) => {
            if (dragging) seek(event.clientX);
          }}
          onPointerUp={(event) => {
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <div className="absolute inset-x-0 top-[5px] h-[6px] rounded-full bg-line" />
          <div
            className="absolute top-[5px] h-[6px] rounded-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
          <span
            className={`absolute top-[1px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-accent ${
              dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            style={{ left: `${Math.min(99, Math.max(1, progress * 100))}%` }}
          />
        </div>

        <div className="flex items-center gap-2.5 pb-1 pt-1 sm:hidden">
          <button onClick={() => setFullscreen(true)} className="shrink-0" aria-label="Открыть плеер">
            <img
              src={track.cover_big}
              alt=""
              className="h-9 w-9 rounded-md border border-line object-cover"
            />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium">{track.title}</p>
            <p className="truncate text-[11px] text-muted">{track.artist}</p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center pb-2 sm:hidden">
          <div className="flex items-center justify-between">
            <button
              onClick={() => void toggleLike(track)}
              className={`flex h-9 w-9 items-center justify-center rounded-md ${
                liked ? "text-accent" : "text-muted"
              }`}
              aria-label="Лайк"
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
            </button>

            <button
              onClick={previous}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
              aria-label="Назад"
            >
              <SkipBack size={17} />
            </button>
          </div>

          {playButton("mobile")}

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                next();
                void ensureQueue();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
              aria-label="Вперёд"
            >
              <SkipForward size={17} />
            </button>

            <button
              onClick={() => void dislike(track)}
              disabled={liked}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted disabled:opacity-30"
              aria-label="Не нравится"
            >
              <ThumbsDown size={16} />
            </button>

            <button
              onClick={cycleRepeat}
              className={`flex h-9 w-9 items-center justify-center rounded-md ${
                repeat === "off" ? "text-muted" : "text-accent"
              }`}
              aria-label="Повтор"
            >
              {repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>

            <button
              onClick={() => void playSimilar()}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted"
              aria-label="Похожие треки"
            >
              <SimilarIcon size={16} />
            </button>
          </div>
        </div>

        <div className="hidden h-[84px] items-center gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setFullscreen(true)}
              className="shrink-0"
              aria-label="Открыть плеер"
            >
              <img
                src={track.cover_big}
                alt=""
                className="h-12 w-12 rounded-md border border-line object-cover"
              />
            </button>

            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{track.title}</p>
              <p className="truncate text-[12px] text-muted">{track.artist}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={previous}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
              aria-label="Назад"
            >
              <SkipBack size={17} />
            </button>

            {playButton("desktop")}

            <button
              onClick={() => {
                next();
                void ensureQueue();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
              aria-label="Вперёд"
            >
              <SkipForward size={16} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => void toggleLike(track)}
              className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface2 ${
                liked ? "text-accent" : "text-muted hover:text-ink"
              }`}
              aria-label="Лайк"
            >
              <Heart size={15} fill={liked ? "currentColor" : "none"} />
            </button>

            <button
              onClick={() => void dislike(track)}
              disabled={liked}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Не нравится"
            >
              <ThumbsDown size={16} />
            </button>

            <button
              onClick={() => void playSimilar()}
              className="flex h-9 items-center gap-1.5 rounded-md px-2 text-muted hover:bg-surface2 hover:text-ink"
              aria-label="Похожие треки"
            >
              <SimilarIcon />
            </button>

            <button
              onClick={cycleRepeat}
              className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface2 ${
                repeat === "off" ? "text-muted hover:text-ink" : "text-accent"
              }`}
              aria-label="Повтор"
            >
              {repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>

            <span className="whitespace-nowrap text-[11px] tabular-nums text-muted">
              {formatTime(time)} / {formatTime(duration)}
            </span>

            <button
              onClick={mute}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"
              aria-label="Звук"
            >
              <VolumeIcon size={16} />
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="range w-14"
              aria-label="Громкость"
            />

            <div ref={speedRef} className="relative">
              <button
                onClick={() => setSpeedOpen((value) => !value)}
                className="rounded-md border border-line px-2 py-1 text-[11px] tabular-nums text-muted hover:border-lineStrong hover:text-ink"
              >
                {rate.toFixed(2).replace(/0$/, "")}x
              </button>

              {speedOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-line bg-surface p-3 shadow-lift">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                      Скорость
                    </span>
                    <span className="text-[12px] tabular-nums">{rate.toFixed(2)}x</span>
                  </div>

                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={rate}
                    onChange={(event) => setRate(Number(event.target.value))}
                    className="range mt-3 w-full"
                    aria-label="Скорость"
                  />

                  <div className="mt-3 flex gap-1">
                    {presets.map((value) => (
                      <button
                        key={value}
                        onClick={() => setRate(value)}
                        className={`flex-1 rounded-md border px-2 py-1 text-[11px] tabular-nums ${
                          rate === value
                            ? "border-ink bg-ink text-bg"
                            : "border-line text-muted hover:border-lineStrong hover:text-ink"
                        }`}
                      >
                        {value}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
