"use client";

import { Play } from "lucide-react";

import AssistantIcon from "@/components/AssistantIcon";
import { coverSource } from "@/lib/audio";
import type { AssistantMessage } from "@/store/assistantStore";
import type { Track } from "@/store/playerStore";

type Props = {
  message: AssistantMessage;
  onPlay: (tracks: Track[], index: number) => void;
};

export default function AssistantMessageView({ message, onPlay }: Props) {
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
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                Из каталога · {message.tracks.length}
              </p>
              <button
                onClick={() => onPlay(message.tracks!, 0)}
                className="rounded-full border border-line px-2.5 py-1 text-[10px] text-ink transition-colors hover:border-lineStrong"
              >
                Слушать все
              </button>
            </div>

            <div className="custom-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {message.tracks.map((track, index) => (
                <button
                  key={`${track.id}-${index}`}
                  onClick={() => onPlay(message.tracks!, index)}
                  className="group w-[128px] shrink-0 text-left"
                >
                  <span className="relative block aspect-square overflow-hidden rounded-xl border border-line bg-surface2">
                    <img
                      src={coverSource(track.cover_big, "medium")}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors group-hover:bg-accent group-hover:text-accentText">
                      <Play size={12} fill="currentColor" />
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-[11px] font-medium text-ink">
                    {track.title}
                  </span>
                  <span className="block truncate text-[10px] text-muted">{track.artist}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
