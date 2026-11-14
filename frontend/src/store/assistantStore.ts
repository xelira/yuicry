import { create } from "zustand";

import type { Track } from "@/store/playerStore";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tracks?: Track[];
  failed?: boolean;
};

type AssistantState = {
  open: boolean;
  expanded: boolean;
  messages: AssistantMessage[];
  busy: boolean;
  listening: boolean;
  voice: boolean;
  setOpen: (open: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setBusy: (busy: boolean) => void;
  setListening: (listening: boolean) => void;
  setVoice: (voice: boolean) => void;
  addMessage: (message: Omit<AssistantMessage, "id">) => void;
  clear: () => void;
};

function messageID() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useAssistant = create<AssistantState>((set) => ({
  open: false,
  expanded: false,
  messages: [],
  busy: false,
  listening: false,
  voice: true,

  setOpen: (open) => set(open ? { open } : { open, expanded: false }),
  setExpanded: (expanded) => set({ expanded }),
  setBusy: (busy) => set({ busy }),
  setListening: (listening) => set({ listening }),
  setVoice: (voice) => set({ voice }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, { ...message, id: messageID() }].slice(-40),
    })),

  clear: () => set({ messages: [], busy: false, listening: false }),
}));
