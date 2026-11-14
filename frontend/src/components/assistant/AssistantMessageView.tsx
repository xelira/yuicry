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
