"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Mic, Play, RotateCcw, Square, X } from "lucide-react";

import RecognizeIcon from "@/components/RecognizeIcon";
import { coverSource } from "@/lib/audio";
import { requestMicrophone } from "@/lib/speech";
import { usePlayer, type Track } from "@/store/playerStore";
import { useRecognize } from "@/store/recognizeStore";

type Recognition = {
  title: string;
  artist: string;
  album: string;
  cover: string;
  shazam: string;
  tracks: Track[];
};

type Phase = "idle" | "recording" | "searching" | "result" | "error";

const duration = 9;
const bars = 34;

export default function Recognize() {
  const open = useRecognize((state) => state.open);
  const setOpen = useRecognize((state) => state.setOpen);

  const playQueue = usePlayer((state) => state.playQueue);
  const toggleLike = usePlayer((state) => state.toggleLike);
  const likes = usePlayer((state) => state.likes);

  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Recognition | null>(null);
  const [error, setError] = useState("");
  const [brokenCover, setBrokenCover] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cancelled = useRef(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const animation = useRef<number | null>(null);
  const peaks = useRef<number[]>([]);
  const loudness = useRef(0.08);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  const paint = () => {
    animation.current = null;

    const element = canvas.current;
    const node = analyser.current;

    if (!element) {
      if (node) animation.current = window.requestAnimationFrame(paint);
      return;
    }

    const context = element.getContext("2d");
    if (!context) {
      if (node) animation.current = window.requestAnimationFrame(paint);
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) {
      if (node) animation.current = window.requestAnimationFrame(paint);
      return;
    }

    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(element).color || "#ff5a36";

    if (!node) {
      context.globalAlpha = 0.22;
      context.fillRect(0, height / 2 - 0.5, width, 1);
      context.globalAlpha = 1;
      return;
    }

    if (peaks.current.length !== bars) peaks.current = new Array(bars).fill(0);

    const data = new Uint8Array(node.frequencyBinCount);
    node.getByteFrequencyData(data);

    const gap = 2;
    const barWidth = Math.max(1.5, (width - gap * (bars - 1)) / bars);
    const lowest = 1;
    const highest = Math.max(lowest + 1, Math.min(data.length - 1, 180));
    const curve = Math.pow(highest / lowest, 1 / bars);

    const raw: number[] = [];
    let energy = 0;

    for (let index = 0; index < bars; index += 1) {
      const from = Math.floor(lowest * Math.pow(curve, index));
      const to = Math.max(from + 1, Math.floor(lowest * Math.pow(curve, index + 1)));

      let peak = 0;
      for (let bin = from; bin < to; bin += 1) {
        if (data[bin] > peak) peak = data[bin];
      }

      const normalized = peak / 255;
      if (normalized > energy) energy = normalized;

      const tilt = 0.55 + 1.9 * (index / bars);
      raw.push(Math.pow(normalized, 1.2) * tilt);
    }

    let loudest = 0;
    for (const value of raw) if (value > loudest) loudest = value;

    loudness.current = Math.max(loudest, loudness.current * 0.9, 0.08);
    const target = Math.min(1, 1 / loudness.current);
    const gate = Math.max(0, Math.min(1, (energy - 0.03) / 0.05));

    for (let index = 0; index < bars; index += 1) {
      const value = Math.min(1, raw[index] * target) * gate;
      peaks.current[index] = peaks.current[index] * 0.55 + value * 0.45;

      const barHeight = Math.max(1.5, peaks.current[index] * height * 0.9);
      const x = index * (barWidth + gap);
      const y = (height - barHeight) / 2;

      context.globalAlpha = 0.35 + peaks.current[index] * 0.65;
      context.beginPath();

      if (typeof context.roundRect === "function") {
        context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      } else {
        context.rect(x, y, barWidth, barHeight);
      }

      context.fill();
    }

    context.globalAlpha = 1;
    animation.current = window.requestAnimationFrame(paint);
  };

  const startWaveform = (media: MediaStream) => {
    const Context = window.AudioContext;

    if (!Context) {
      paint();
      return;
    }

    const context = new Context();
    const source = context.createMediaStreamSource(media);
    const node = context.createAnalyser();

    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.72;
    source.connect(node);

    audioContext.current = context;
    analyser.current = node;
    peaks.current = new Array(bars).fill(0);
    loudness.current = 0.08;

    if (context.state === "suspended") void context.resume();
    if (animation.current !== null) window.cancelAnimationFrame(animation.current);

    paint();
  };

  const stopWaveform = () => {
    if (animation.current !== null) {
      window.cancelAnimationFrame(animation.current);
      animation.current = null;
    }

    analyser.current = null;

    const context = audioContext.current;
    audioContext.current = null;

    if (context && context.state !== "closed") void context.close();
    paint();
  };

  const stopTracks = () => {
    stopWaveform();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  const stopRecording = () => {
    clearTimer();

    if (recorder.current && recorder.current.state !== "inactive") {
      setPhase("searching");
      recorder.current.stop();
      return;
    }

    stopTracks();
  };

  const upload = async (blob: Blob) => {
    if (cancelled.current) return;

    if (blob.size < 1024) {
      setPhase("error");
      setError("Не расслышал. Попробуй ближе к музыке.");
      return;
    }

    setPhase("searching");
    const request = new AbortController();
    controller.current = request;

    try {
      const response = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
        signal: request.signal,
      });

      if (cancelled.current) return;

      if (!response.ok) {
        setPhase("error");
        setError(
          response.status === 404
            ? "Не удалось распознать. Попробуй ещё раз ближе к источнику."
            : "Сервис распознавания недоступен.",
        );
        return;
      }

      const data = (await response.json()) as Recognition;
      setBrokenCover(false);
      setResult(data);
      setPhase("result");
    } catch (failure) {
      if (cancelled.current) return;
      if (failure instanceof DOMException && failure.name === "AbortError") return;
      setPhase("error");
      setError("Не удалось отправить запись. Проверь соединение.");
    } finally {
      if (controller.current === request) controller.current = null;
    }
  };

  const start = async () => {
    setError("");
    setResult(null);
    setSeconds(0);
    setBrokenCover(false);
    cancelled.current = false;

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError("Запись недоступна в этом браузере.");
      return;
    }

    const granted = await requestMicrophone();
    if (!granted) {
      setPhase("error");
      setError("Разреши доступ к микрофону.");
      return;
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      stream.current = media;

      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
        (value) => MediaRecorder.isTypeSupported(value),
      );
      const mediaRecorder = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = mediaRecorder;
      chunks.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        stopTracks();
        const blob = new Blob(chunks.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        void upload(blob);
      };

      mediaRecorder.start();
      setPhase("recording");
      setSeconds(0);
      startWaveform(media);

      timer.current = window.setInterval(() => {
        setSeconds((value) => {
          const next = value + 1;
          if (next >= duration) stopRecording();
          return Math.min(next, duration);
        });
      }, 1000);
    } catch (failure) {
      stopTracks();
      setPhase("error");
      setError("Не удалось включить микрофон.");
    }
  };

  const close = () => {
    cancelled.current = true;
    clearTimer();
    controller.current?.abort();
    controller.current = null;

    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
    }

    recorder.current = null;
    stopTracks();
    setOpen(false);
    setPhase("idle");
    setResult(null);
    setError("");
    setSeconds(0);
    setBrokenCover(false);
  };

  useEffect(() => {
    if (open) return;

    clearTimer();
    stopTracks();
    setPhase("idle");
    setResult(null);
    setError("");
    setSeconds(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    return () => {
      if (animation.current !== null) window.cancelAnimationFrame(animation.current);
      const context = audioContext.current;
      audioContext.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, []);

  if (!open) return null;

  const track = result?.tracks[0];
  const liked = track ? Boolean(likes[track.id]) : false;
  const progress = Math.min(seconds / duration, 1);
  const cover = result ? result.cover || track?.cover_big || "" : "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[3px] animate-[fade-in_.18s_ease-out]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Узнать музыку"
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[400px] overflow-hidden rounded-[26px] border border-line bg-bg p-6 shadow-2xl animate-[sheet-in_.3s_cubic-bezier(.22,1,.36,1)]"
      >
        <button
          onClick={close}
          aria-label="Закрыть"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          <X size={17} />
        </button>

        {phase === "idle" && (
          <div>
            <h2 className="pr-10 text-[19px] font-semibold tracking-tight text-ink">Узнать музыку</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Включи трек рядом и нажми — послушаю 9 секунд.
            </p>

            <button
              onClick={() => void start()}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-medium text-accentText transition hover:brightness-110 active:scale-[0.99]"
            >
              <Mic size={16} />
              Слушать
            </button>

            <p className="mt-3 text-center text-[11px] text-muted">
              Точнее — ближе к источнику и без лишнего шума.
            </p>
          </div>
        )}

        {phase === "recording" && (
          <div>
            <div className="flex items-center gap-2 pr-10">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <h2 className="text-[19px] font-semibold tracking-tight text-ink">Слушаю</h2>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Держи телефон рядом с музыкой.
            </p>

            <div className="mt-5 h-20 rounded-2xl border border-line bg-surface">
              <canvas ref={canvas} className="h-full w-full text-accent" aria-hidden="true" />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {seconds} / {duration}
              </span>
            </div>

            <button
              onClick={stopRecording}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line text-[13px] font-medium text-ink transition-colors hover:border-lineStrong hover:bg-surface2"
            >
              <Square size={13} fill="currentColor" />
              Остановить
            </button>
          </div>
        )}

        {phase === "searching" && (
          <div>
            <h2 className="pr-10 text-[19px] font-semibold tracking-tight text-ink">Ищу совпадение</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Сверяю запись с базой Shazam. Обычно пара секунд.
            </p>

            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-line bg-surface p-3">
              <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-surface2" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-surface2" />
                <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-surface2" />
                <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-surface2" />
              </div>
            </div>

            <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-line">
              <div className="h-full w-1/3 animate-[loading-slide_1.3s_ease-in-out_infinite] rounded-full bg-accent" />
            </div>

            <button
              onClick={close}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-full text-[12.5px] text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              Отменить
            </button>
          </div>
        )}

        {phase === "result" && result && (
          <div>
            <h2 className="pr-10 text-[19px] font-semibold tracking-tight text-ink">Нашёл</h2>

            <div className="mt-5 flex items-center gap-4">
              <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl border border-line bg-surface2">
                <span className="absolute inset-0 flex items-center justify-center text-muted">
                  <RecognizeIcon size={22} />
                </span>
                {cover && !brokenCover && (
                  <img
                    src={coverSource(cover, "medium")}
                    alt=""
                    onError={() => setBrokenCover(true)}
                    className="relative h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-snug tracking-tight text-ink">
                  {result.title}
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">{result.artist}</p>
                {result.album && (
                  <p className="mt-0.5 truncate text-[11px] text-muted/80">{result.album}</p>
                )}
              </div>
            </div>

            {track ? (
              <>
                <button
                  onClick={() => {
                    playQueue(result.tracks, 0);
                    close();
                  }}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-medium text-accentText transition hover:brightness-110 active:scale-[0.99]"
                >
                  <Play size={14} fill="currentColor" />
                  Слушать
                </button>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void toggleLike(track)}
                    className={`flex h-11 items-center justify-center gap-2 rounded-full border text-[12.5px] transition-colors ${
                      liked
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-line text-muted hover:border-lineStrong hover:text-ink"
                    }`}
                  >
                    <Heart size={14} fill={liked ? "currentColor" : "none"} />
                    {liked ? "В избранном" : "В избранное"}
                  </button>

                  <button
                    onClick={() => void start()}
                    className="flex h-11 items-center justify-center gap-2 rounded-full border border-line text-[12.5px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
                  >
                    <RotateCcw size={14} />
                    Ещё раз
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-[12px] leading-relaxed text-muted">
                  В каталоге Deezer этот трек не нашёлся.
                </p>
                <button
                  onClick={() => void start()}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line text-[12.5px] text-ink transition-colors hover:border-lineStrong hover:bg-surface2"
                >
                  <RotateCcw size={14} />
                  Ещё раз
                </button>
              </>
            )}
          </div>
        )}

        {phase === "error" && (
          <div>
            <h2 className="pr-10 text-[19px] font-semibold tracking-tight text-ink">Не получилось</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{error}</p>

            <button
              onClick={() => void start()}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-medium text-accentText transition hover:brightness-110 active:scale-[0.99]"
            >
              <RotateCcw size={15} />
              Попробовать снова
            </button>

            <button
              onClick={close}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-full text-[12.5px] text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
