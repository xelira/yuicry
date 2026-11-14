"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";

import AssistantIcon from "@/components/AssistantIcon";
import { askAssistant, type AssistantAction, type AssistantChatMessage } from "@/lib/assistant";
import { coverSource } from "@/lib/audio";
import {
  listen,
  requestMicrophone,
  speak,
  speechSupported,
  stopSpeaking,
  ttsSupported,
  type ListeningSession,
} from "@/lib/speech";
import { playWave } from "@/lib/wave";
import { useAssistant, type AssistantMessage } from "@/store/assistantStore";
import { currentTrack, usePlayer, type Track } from "@/store/playerStore";

const voiceKey = "yuicry:assistant-voice";

const suggestions = [
  "Что послушать под настроение?",
  "Включи мою волну",
  "Посоветуй похожее",
  "Поставь на паузу",
];

export default function Assistant() {
  const open = useAssistant((state) => state.open);
  const messages = useAssistant((state) => state.messages);
  const busy = useAssistant((state) => state.busy);
  const listening = useAssistant((state) => state.listening);
  const voice = useAssistant((state) => state.voice);
  const setOpen = useAssistant((state) => state.setOpen);
  const setBusy = useAssistant((state) => state.setBusy);
  const setListening = useAssistant((state) => state.setListening);
  const setVoice = useAssistant((state) => state.setVoice);
  const addMessage = useAssistant((state) => state.addMessage);
  const clear = useAssistant((state) => state.clear);

  const track = usePlayer(currentTrack);

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const session = useRef<ListeningSession | null>(null);
  const stopped = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const available = speechSupported();
  const canSpeak = ttsSupported();

  useEffect(() => {
    const saved = localStorage.getItem(voiceKey);
    if (saved !== null) setVoice(saved === "1");
  }, [setVoice]);

  useEffect(() => {
    if (!open) return;

    if (window.innerWidth >= 640) inputRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) return;

    stopped.current = true;
    session.current?.stop();
    session.current = null;
    setListening(false);
    stopSpeaking();
  }, [open, setListening]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;

    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy, open]);

  const context = () => {
    const player = usePlayer.getState();
    const current = player.queue[player.index];

    return {
      track: current?.title ?? "",
      artist: current?.artist ?? "",
      playing: player.playing,
      queue: player.queue.length,
      likes: player.liked.length,
    };
  };

  const applyAction = (action: AssistantAction, tracks: Track[]) => {
    const player = usePlayer.getState();

    if (action === "play" && tracks.length > 0) {
      player.playQueue(tracks);
      window.setTimeout(() => useAssistant.getState().setOpen(false), 800);
      return;
    }

    if (action === "wave") {
      void playWave().then((started) => {
        if (started) window.setTimeout(() => useAssistant.getState().setOpen(false), 800);
      });
      return;
    }

    if (action === "pause") {
      player.setPlaying(false);
      return;
    }

    if (action === "resume") {
      player.setPlaying(true);
      return;
    }

    if (action === "next") {
      player.next();
      return;
    }

    if (action === "previous") {
      player.previous();
      return;
    }

    if (action === "like") {
      const current = player.queue[player.index];
      if (current && !player.likes[current.id]) void player.toggleLike(current);
    }
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || useAssistant.getState().busy) return;

    stopSpeaking();
    setError("");
    addMessage({ role: "user", text });
    setInput("");
    setBusy(true);

    try {
      const history: AssistantChatMessage[] = useAssistant
        .getState()
        .messages.filter((message) => !message.failed)
        .slice(-8)
        .map((message) => ({ role: message.role, content: message.text }));

      const answer = await askAssistant(history, context());
      addMessage({ role: "assistant", text: answer.reply, tracks: answer.tracks });
      applyAction(answer.action, answer.tracks);

      if (useAssistant.getState().voice && answer.action !== "play" && answer.action !== "wave") {
        void speak(answer.reply);
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Не получилось ответить";
      setError(message);
      addMessage({
        role: "assistant",
        text: "Не получилось ответить. Попробуй ещё раз.",
        failed: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleListen = async () => {
    if (listening) {
      stopped.current = true;
      session.current?.stop();
      session.current = null;
      setListening(false);
      return;
    }

    if (useAssistant.getState().busy) return;

    setError("");
    const granted = await requestMicrophone();
    if (!granted) {
      setError("Разреши доступ к микрофону");
      return;
    }

    stopSpeaking();
    stopped.current = false;
    setListening(true);

    try {
      const current = listen((text) => setInput(text));
      session.current = current;
      const text = await current.result;
      session.current = null;
      setListening(false);
      setInput("");

      if (text.trim()) await send(text);
    } catch (failure) {
      session.current = null;
      setListening(false);

      if (!stopped.current) {
        setError(failure instanceof Error ? failure.message : "Не получилось распознать речь");
      }
    }
  };

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    localStorage.setItem(voiceKey, next ? "1" : "0");
    if (!next) stopSpeaking();
  };

  const playTrack = (tracks: Track[], index: number) => {
    usePlayer.getState().playQueue(tracks, index);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/35 backdrop-blur-[2px] animate-[fade-in_.2s_ease-out]"
      onClick={() => setOpen(false)}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ассистент"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-[460px] flex-col border-line bg-bg shadow-2xl sm:border-l sm:animate-[panel-in_.32s_cubic-bezier(.22,1,.36,1)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-3 pt-[calc(14px+var(--inset-top,0px))]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink">
            <AssistantIcon size={19} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold tracking-tight text-ink">Ассистент</p>
            <p className="truncate text-[11px] text-muted">
              {listening ? "Слушаю…" : busy ? "Думаю…" : "Музыка и всё вокруг неё"}
            </p>
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => {
                stopSpeaking();
                clear();
              }}
              aria-label="Новый диалог"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              <RotateCcw size={17} />
            </button>
          )}

          {canSpeak && (
            <button
              onClick={toggleVoice}
              aria-label={voice ? "Выключить озвучку" : "Включить озвучку"}
              aria-pressed={voice}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                voice ? "text-ink hover:bg-surface2" : "text-muted hover:bg-surface2 hover:text-ink"
              }`}
            >
              {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          )}

          <button
            onClick={() => setOpen(false)}
            aria-label="Закрыть ассистента"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <X size={19} />
          </button>
        </header>

        <div
          ref={scrollRef}
          aria-live="polite"
          className="custom-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface text-ink">
                <AssistantIcon size={30} />
              </span>
              <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-ink">Чем помочь?</h2>
              <p className="mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-muted">
                Спрошу про треки и исполнителей, включу музыку или расскажу, что сейчас играет.
              </p>

              {track && (
                <p className="mt-3 max-w-[300px] truncate text-[11px] text-muted">
                  Сейчас играет {track.title} — {track.artist}
                </p>
              )}

              <div className="mt-5 flex w-full flex-wrap justify-center gap-1.5">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    onClick={() => void send(item)}
                    disabled={busy}
                    className="rounded-full border border-line px-3 py-1.5 text-[11px] text-muted transition-colors hover:border-lineStrong hover:text-ink disabled:opacity-50"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  onPlay={(tracks, index) => playTrack(tracks, index)}
                />
              ))}
            </div>
          )}

          {busy && (
            <div className="mt-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">
                <AssistantIcon size={15} />
              </span>
              <span className="flex h-5 items-center gap-1" aria-label="Ассистент думает">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
                    style={{ animationDelay: `${index * 140}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-bg px-3 pb-[calc(12px+var(--inset-bottom,0px))] pt-3">
          {listening && (
            <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-muted">
              <span className="flex h-3.5 items-end gap-[3px]" aria-hidden="true">
                {[0.55, 1, 0.7, 0.9, 0.5].map((value, index) => (
                  <span
                    key={index}
                    className="w-[2px] origin-bottom rounded-full bg-accent"
                    style={{
                      height: `${value * 100}%`,
                      animation: `wave 1s ease-in-out ${index * 0.12}s infinite`,
                    }}
                  />
                ))}
              </span>
              Слушаю…
            </div>
          )}

          {error && <p className="mb-2 text-center text-[11px] text-muted">{error}</p>}

          <div className="flex items-end gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-2xl border border-line bg-surface px-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  void send();
                }}
                placeholder="Спроси про музыку…"
                aria-label="Вопрос ассистенту"
                className="h-10 w-full bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
              />
            </div>

            {available && (
              <button
                onClick={() => void toggleListen()}
                disabled={busy}
                aria-label={listening ? "Остановить запись" : "Спросить голосом"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  listening
                    ? "border-accent bg-accent text-accentText"
                    : "border-line bg-surface text-ink hover:border-lineStrong"
                }`}
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}

            <button
              onClick={() => void send()}
              disabled={!input.trim() || busy}
              aria-label="Отправить"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accentText transition hover:brightness-110 disabled:opacity-40"
            >
              <ArrowUp size={19} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Message({
  message,
  onPlay,
}: {
  message: AssistantMessage;
  onPlay: (tracks: Track[], index: number) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-surface2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">
        <AssistantIcon size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`whitespace-pre-line text-[13px] leading-relaxed ${
            message.failed ? "text-muted" : "text-ink"
          }`}
        >
          {message.text}
        </p>

        {message.tracks && message.tracks.length > 0 && (
          <div className="mt-2.5 overflow-hidden rounded-xl border border-line bg-surface">
            {message.tracks.map((track, index) => (
              <button
                key={`${track.id}-${index}`}
                onClick={() => onPlay(message.tracks!, index)}
                className="flex w-full items-center gap-2.5 border-b border-line px-2.5 py-2 text-left transition-colors last:border-b-0 hover:bg-surface2"
              >
                <img
                  src={coverSource(track.cover_big, "small")}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-ink">{track.title}</span>
                  <span className="block truncate text-[11px] text-muted">{track.artist}</span>
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accentText">
                  <Play size={13} fill="currentColor" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
