"use client";

import { Maximize2, Mic, MicOff, X } from "lucide-react";

import AssistantIcon from "@/components/AssistantIcon";
import { coverSource } from "@/lib/audio";
import type { AssistantMessage } from "@/store/assistantStore";
import type { Track } from "@/store/playerStore";

type Props = {
  busy: boolean;
  listening: boolean;
  status: string;
  error: string;
  last: AssistantMessage | null;
  track: Track | null;
  onMic: () => void;
  onExpand: () => void;
  onHide: () => void;
};

export default function AssistantIsland({
  busy,
  listening,
  status,
  error,
  last,
  track,
  onMic,
  onExpand,
  onHide,
}: Props) {
  const title = listening
    ? status || "Слушаю…"
    : busy
      ? "Думаю…"
      : error || last?.text || "Спроси про музыку";

  const preparing = status.includes("Загружаю") || status.includes("Готовлю") || status.includes("модель");

  const subtitle = listening
    ? preparing
      ? "Первый запуск"
      : "Говори…"
    : busy
      ? "Ассистент"
      : last
        ? last.tracks?.length
          ? `${last.tracks.length} треков`
          : "Ассистент"
        : track
          ? `${track.title} — ${track.artist}`
          : "Голосовой помощник";

  return (
    <div className="fixed left-1/2 top-[calc(8px+var(--inset-top,0px))] z-[60] w-fit max-w-[calc(100vw-24px)] -translate-x-1/2 animate-[island-in_.28s_cubic-bezier(.22,1,.36,1)] sm:max-w-[560px]">
      <div
        onDoubleClick={onExpand}
        className="flex items-center gap-2 rounded-[22px] border border-line bg-surface/95 py-1.5 pl-1.5 pr-1 shadow-lift backdrop-blur-xl"
      >
        <span
          onDoubleClick={onExpand}
          className="flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full border border-line bg-bg text-ink"
        >
          <AssistantIcon size={17} />
        </span>

        <div
          onDoubleClick={onExpand}
          className="min-w-0 max-w-[190px] cursor-default sm:max-w-[300px]"
          aria-live="polite"
        >
          <div className="flex items-center gap-1.5">
            {listening && (
              <span className="flex h-3 shrink-0 items-end gap-[2px]" aria-hidden="true">
                {[0.5, 1, 0.7, 0.9, 0.45].map((value, index) => (
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
            )}
            <p className="truncate text-[12px] font-medium text-ink">{title}</p>
          </div>
          <p className="truncate text-[10px] text-muted">{subtitle}</p>
        </div>

        {!busy && !listening && last?.tracks && last.tracks.length > 0 && (
          <button
            onClick={onExpand}
            aria-label="Открыть найденные треки"
            className="flex shrink-0 -space-x-2 pl-1"
          >
            {last.tracks.slice(0, 3).map((item) => (
              <img
                key={item.id}
                src={coverSource(item.cover_big, "small")}
                alt=""
                className="h-6 w-6 rounded-md border border-line object-cover"
              />
            ))}
          </button>
        )}

        <button
          onClick={onMic}
          onDoubleClick={(event) => event.stopPropagation()}
          disabled={busy}
          aria-label={listening ? "Остановить запись" : "Спросить голосом"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
            listening
              ? "border-accent bg-accent text-accentText"
              : "border-line bg-bg text-ink hover:border-lineStrong"
          }`}
        >
          {listening ? <MicOff size={15} /> : <Mic size={15} />}
        </button>

        <button
          onClick={onExpand}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label="Развернуть ассистента"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          <Maximize2 size={15} />
        </button>

        <button
          onClick={onHide}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label="Скрыть ассистента"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
