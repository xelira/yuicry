import { create } from "zustand";

type RecognizeState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useRecognize = create<RecognizeState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
