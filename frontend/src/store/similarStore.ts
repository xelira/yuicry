import { create } from "zustand";

import type { Track } from "@/store/playerStore";

type SimilarState = {
  track: Track | null;
  open: (track: Track) => void;
  close: () => void;
};

export const useSimilar = create<SimilarState>((set) => ({
  track: null,

  open: (track) => set({ track }),

  close: () => set({ track: null }),
}));
