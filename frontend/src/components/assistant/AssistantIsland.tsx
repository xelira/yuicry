"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Mic, MicOff, Square, X } from "lucide-react";

import AssistantIcon from "@/components/AssistantIcon";
import { coverSource } from "@/lib/audio";
import type { AssistantAttachment } from "@/lib/assistant";
import { pluralRu } from "@/lib/plural";
import type { AssistantMessage } from "@/store/assistantStore";
import type { Track } from "@/store/playerStore";

type Props = {
  busy: boolean;
  listening: boolean;
  status: string;
  error: string;
  last: AssistantMessage | null;
  track: Track | null;
  attachment: AssistantAttachment | null;
  available: boolean;
  onMic: () => void;
  onStop: () => void;
  onExpand: () => void;
  onHide: () => void;
};

const positionKey = "yuicry:assistant-island";

type Position = { x: number; y: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function readPosition(): Position | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(positionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;

    return {
      x: clamp(parsed.x, 90, window.innerWidth - 90),
      y: clamp(parsed.y, 8, window.innerHeight - 70),
    };
  } catch (error) {
    return null;
  }
}

export default function AssistantIsland({
  busy,
  listening,
  status,
  error,
  last,
  track,
  attachment,
  available,
  onMic,
  onStop,
  onExpand,
  onHide,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(() => readPosition());
  const positionRef = useRef(position);
  const drag = useRef<{
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);

  positionRef.current = position;

  useEffect(() => {
    if (!position) return;

    const update = () => {
      const rect = ref.current?.getBoundingClientRect();
      const width = rect?.width ?? 320;
      setPosition((value) =>
        value
          ? {
              x: clamp(value.x, width / 2 + 8, window.innerWidth - width / 2 - 8),
              y: clamp(value.y, 8, window.innerHeight - 70),
            }
          : value,
      );
    };

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [Boolean(position)]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;

    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      moved: false,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (error) {
      return;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const value = drag.current;
    if (!value) return;

    const dx = event.clientX - value.startX;
    const dy = event.clientY - value.startY;

    if (!value.moved && Math.hypot(dx, dy) > 4) value.moved = true;
    if (!value.moved) return;

    event.preventDefault();

    const rect = ref.current?.getBoundingClientRect();
    const width = rect?.width ?? 320;

    const next = {
      x: clamp(value.centerX + dx, width / 2 + 8, window.innerWidth - width / 2 - 8),
      y: clamp(value.centerY + dy, 8, window.innerHeight - 70),
    };

    positionRef.current = next;
    setPosition(next);
  };

  const onPointerUp = () => {
    const value = drag.current;
    drag.current = null;

    if (!value?.moved) return;

    moved.current = true;
    if (positionRef.current) {
      try {
        localStorage.setItem(positionKey, JSON.stringify(positionRef.current));
      } catch (error) {
        return;
      }
    }

    window.setTimeout(() => {
      moved.current = false;
    }, 300);
  };

  const expand = () => {
    if (moved.current) return;
    onExpand();
  };

  const title = listening
    ? status || "Слушаю…"
    : busy
      ? "Думаю…"
      : last?.text || (attachment ? "Спроси про вложение" : "Спроси про музыку");

  const preparing = status.includes("Загружаю") || status.includes("Готовлю") || status.includes("модель");

  const subtitle = error
    ? error
    : listening
      ? preparing
        ? "Первый запуск"
        : "Говори…"
      : busy
        ? "Ассистент"
        : !available
          ? "Голосовой ввод недоступен"
          : last
            ? last.tracks?.length
              ? `${last.tracks.length} ${pluralRu(last.tracks.length, "трек", "трека", "треков")}`
              : "Ассистент"
            : attachment
              ? attachment.kind === "track"
                ? `Трек: ${attachment.title}`
                : `Плейлист: ${attachment.title}`
              : track
                ? `${track.title} — ${track.artist}`
                : "Голосовой помощник";

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={expand}
      style={
        position
          ? { left: position.x, top: position.y, transform: "translateX(-50%)" }
          : undefined
      }
      className={`fixed z-[60] w-fit max-w-[calc(100vw-24px)] touch-none select-none animate-[island-in_.28s_cubic-bezier(.22,1,.36,1)] sm:max-w-[560px] ${
        position
          ? ""
          : "left-1/2 top-[calc(8px+var(--inset-top,0px))] -translate-x-1/2"
      }`}
    >
      <div className="flex items-center gap-2 rounded-[22px] border border-line bg-surface/95 py-1.5 pl-1.5 pr-1 shadow-lift backdrop-blur-xl">
        <span
          className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-full border border-line bg-bg text-ink active:cursor-grabbing"
        >
          <AssistantIcon size={17} />
        </span>

        <div
          className="min-w-0 max-w-[190px] cursor-grab sm:max-w-[300px] active:cursor-grabbing"
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
