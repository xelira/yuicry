"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";

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

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cancelled = useRef(false);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  const stopTracks = () => {
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

  if (!open) return null;

  const track = result?.tracks[0];
  const liked = track ? Boolean(likes[track.id]) : false;
  const progress = Math.min(seconds / duration, 1);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px] animate-[fade-in_.2s_ease-out]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Узнать музыку"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-line bg-bg shadow-2xl animate-[sheet-in_.35s_cubic-bezier(.22,1,.36,1)]"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink">
            <RecognizeIcon size={20} />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">Узнать музыку</h2>
            <p className="text-[11px] text-muted">
              {phase === "recording"
                ? "Слушаю…"
                : phase === "searching"
                  ? "Ищу совпадение…"
                  : "Определю трек по звуку"}
            </p>
          </div>

          <button
            onClick={close}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <X size={19} />
          </button>
        </header>

        <div className="p-5 sm:p-6">
          {phase === "idle" && (
            <div className="flex flex-col items-center py-5 text-center">
              <div className="relative flex h-44 w-44 items-center justify-center">
                <span className="absolute inset-0 rounded-full border border-line" />
                <span className="absolute inset-5 rounded-full border border-line" />
                <span className="absolute inset-10 rounded-full border border-line" />
                <button
                  onClick={() => void start()}
                  aria-label="Начать запись"
                  className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accentText shadow-[0_0_50px_-14px_var(--accent)] transition hover:brightness-110"
                >
                  <Mic size={28} />
                </button>
              </div>

              <p className="mt-5 text-[14px] font-medium text-ink">Включи музыку рядом</p>
              <p className="mt-1 max-w-[300px] text-[12px] leading-relaxed text-muted">
                Нажми и подержи телефон рядом с колонкой. Слушаю {duration} секунд.
              </p>
            </div>
          )}

          {phase === "recording" && (
            <div className="flex flex-col items-center py-5 text-center">
              <div className="relative flex h-44 w-44 items-center justify-center">
                {[0, 0.6, 1.2].map((delay) => (
                  <span
                    key={delay}
                    className="absolute inset-0 rounded-full border border-accent/40"
                    style={{ animation: `recognize-ring 2s ease-out ${delay}s infinite` }}
                  />
                ))}

                <button
                  onClick={stopRecording}
                  aria-label="Остановить запись"
                  className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accentText shadow-[0_0_50px_-14px_var(--accent)]"
                >
                  <Square size={22} fill="currentColor" />
                </button>
              </div>

              <div className="mt-4 flex h-5 items-end gap-1" aria-hidden="true">
                {[0.45, 0.9, 0.6, 1, 0.55, 0.8, 0.4].map((value, index) => (
                  <span
                    key={index}
                    className="w-1 origin-bottom rounded-full bg-accent"
                    style={{
                      height: `${value * 100}%`,
                      animation: `wave 1s ease-in-out ${index * 0.1}s infinite`,
                    }}
                  />
                ))}
              </div>

              <p className="mt-3 text-[14px] font-medium text-ink">Слушаю…</p>
              <p className="mt-1 text-[12px] tabular-nums text-muted">
                {seconds} / {duration} сек
              </p>

              <div className="mt-3 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-1000"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {phase === "searching" && (
            <div className="flex flex-col items-center py-12 text-center">
              <Loader2 size={34} className="animate-spin text-accent" />
              <p className="mt-4 text-[14px] font-medium text-ink">Ищу совпадение…</p>
              <p className="mt-1 text-[12px] text-muted">Сверяю запись с базой Shazam</p>
            </div>
          )}

          {phase === "result" && result && (
            <div className="flex flex-col items-center text-center">
              <img
                src={coverSource(result.cover || track?.cover_big || "", "large")}
                alt=""
                className="h-40 w-40 rounded-2xl border border-line object-cover shadow-2xl sm:h-48 sm:w-48"
              />

              <h3 className="mt-5 line-clamp-2 text-[22px] font-semibold leading-tight tracking-tight text-ink">
                {result.title}
              </h3>
              <p className="mt-1 text-[13px] text-muted">{result.artist}</p>
              {result.album && <p className="mt-0.5 text-[11px] text-muted/80">{result.album}</p>}

              {track ? (
                <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
                  <button
                    onClick={() => {
                      playQueue(result.tracks, 0);
                      close();
                    }}
                    className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[12px] font-medium text-accentText shadow-[0_0_28px_-12px_var(--accent)] transition hover:brightness-110"
                  >
                    Слушать
                  </button>

                  <button
                    onClick={() => void toggleLike(track)}
                    className={`flex h-11 items-center gap-2 rounded-full border px-4 text-[12px] transition-colors ${
                      liked
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "border-line text-muted hover:border-lineStrong hover:text-ink"
                    }`}
                  >
                    <Heart size={14} fill={liked ? "currentColor" : "none"} />
                    {liked ? "В избранном" : "В избранное"}
                  </button>

                  <button
                    onClick={() => void start()}
                    className="flex h-11 items-center gap-2 rounded-full border border-line px-4 text-[12px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
                  >
                    <RotateCcw size={14} />
                    Ещё раз
                  </button>
                </div>
              ) : (
                <div className="mt-5 flex flex-col items-center gap-3">
                  <p className="text-[12px] text-muted">В каталоге Deezer этот трек не нашёлся.</p>
                  <button
                    onClick={() => void start()}
                    className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[12px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
                  >
                    <RotateCcw size={14} />
                    Ещё раз
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface text-muted">
                <Mic size={24} />
              </span>
              <p className="mt-4 max-w-[300px] text-[13px] leading-relaxed text-muted">{error}</p>
              <button
                onClick={() => void start()}
                className="mt-5 flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[12px] font-medium text-accentText transition hover:brightness-110"
              >
                <RotateCcw size={14} />
                Попробовать снова
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
