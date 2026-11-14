"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUp,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import AssistantIcon from "@/components/AssistantIcon";
import AssistantMessageView from "@/components/assistant/AssistantMessageView";
import type { AssistantMessage } from "@/store/assistantStore";
import type { Track } from "@/store/playerStore";

type Props = {
  messages: AssistantMessage[];
  busy: boolean;
  listening: boolean;
  voice: boolean;
  input: string;
  error: string;
  status: string;
  track: Track | null;
  onInput: (value: string) => void;
  onSend: (value?: string) => void;
  onMic: () => void;
  onVoice: () => void;
  onClear: () => void;
  onCollapse: () => void;
  onHide: () => void;
  onPlay: (tracks: Track[], index: number) => void;
};

const suggestions = [
  "Что послушать под настроение?",
  "Включи мою волну",
  "Посоветуй похожее",
  "Поставь на паузу",
];

export default function AssistantPanel({
  messages,
  busy,
  listening,
  voice,
  input,
  error,
  status,
  track,
  onInput,
  onSend,
  onMic,
  onVoice,
  onClear,
  onCollapse,
  onHide,
  onPlay,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.innerWidth >= 640) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;

    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/35 backdrop-blur-[2px] animate-[fade-in_.2s_ease-out]"
      onClick={onCollapse}
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
              {listening ? status || "Слушаю…" : busy ? "Думаю…" : "Музыка и всё вокруг неё"}
            </p>
          </div>

          {messages.length > 0 && (
            <button
              onClick={onClear}
              aria-label="Новый диалог"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              <RotateCcw size={17} />
            </button>
          )}

          <button
            onClick={onVoice}
            aria-label={voice ? "Выключить озвучку" : "Включить озвучку"}
            aria-pressed={voice}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              voice ? "text-ink hover:bg-surface2" : "text-muted hover:bg-surface2 hover:text-ink"
            }`}
          >
            {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <button
            onClick={onCollapse}
            aria-label="Свернуть ассистента"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <Minimize2 size={17} />
          </button>

          <button
            onClick={onHide}
            aria-label="Скрыть ассистента"
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
                    onClick={() => onSend(item)}
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
                <AssistantMessageView key={message.id} message={message} onPlay={onPlay} />
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
              {status || "Слушаю…"}
            </div>
          )}

          {error && <p className="mb-2 text-center text-[11px] text-muted">{error}</p>}

          <div className="flex items-end gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-2xl border border-line bg-surface px-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => onInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  onSend();
                }}
                placeholder="Спроси про музыку…"
                aria-label="Вопрос ассистенту"
                className="h-10 w-full bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none"
              />
            </div>

            <button
              onClick={onMic}
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

            <button
              onClick={() => onSend()}
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
