import type { Track } from "@/store/playerStore";

export type AssistantAction =
  | "none"
  | "play"
  | "pause"
  | "resume"
  | "next"
  | "previous"
  | "like"
  | "wave";

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
};

export type AssistantAnswer = {
  reply: string;
  action: AssistantAction;
  tracks: Track[];
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

  return {
    reply: String(data.reply ?? ""),
    action,
    tracks: Array.isArray(data.tracks) ? (data.tracks as Track[]) : [],
  };
}
