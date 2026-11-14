import type { Track } from "@/store/playerStore";

export type AssistantAction =
  | "none"
  | "play"
  | "pause"
  | "resume"
  | "next"
  | "previous"
  | "like"
  | "wave"
  | "play_likes"
  | "show_likes"
  | "play_index";

export type AssistantSource = {
  title: string;
  url: string;
};

export type AssistantAttachment = {
  kind: "track" | "playlist";
  id: string;
  title: string;
  artist?: string;
  count?: number;
  cover?: string;
};

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantContext = {
  track: string;
  artist: string;
  playing: boolean;
  queue: number;
  likes: number;
  last_tracks: string[];
  attachment: AssistantAttachment | null;
};

export type AssistantAnswer = {
  reply: string;
  action: AssistantAction;
  index: number;
  tracks: Track[];
  sources: AssistantSource[];
};

const actions: AssistantAction[] = [
  "none",
  "play",
  "pause",
  "resume",
  "next",
  "previous",
  "like",
  "wave",
  "play_likes",
  "show_likes",
  "play_index",
];

export async function askAssistant(
  messages: AssistantChatMessage[],
  context: AssistantContext,
): Promise<AssistantAnswer> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context }),
  });

  if (response.status === 429) throw new Error("Слишком много запросов. Подожди минуту.");
  if (!response.ok) throw new Error("Ассистент недоступен");

  const data = await response.json();
  const action = actions.includes(data.action) ? (data.action as AssistantAction) : "none";

  const sources = Array.isArray(data.sources)
    ? (data.sources as AssistantSource[]).filter((item) => item?.title && item?.url)
    : [];

  return {
    reply: String(data.reply ?? ""),
    action,
    index: Number(data.index) || 0,
    tracks: Array.isArray(data.tracks) ? (data.tracks as Track[]) : [],
    sources,
  };
}
