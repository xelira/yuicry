import { create } from "zustand";

export type DragKind = "playlist" | "track";
export type DragTarget = "none" | "delete" | "assistant";

export type DragItem = {
  kind: DragKind;
  title: string;
  cover?: string;
  onDrop: () => void;
  onAttach?: () => void;
};

type DragState = {
  item: DragItem | null;
  x: number;
  y: number;
  over: boolean;
  target: DragTarget;
  consuming: boolean;
  begin: (item: DragItem, x: number, y: number) => void;
  move: (x: number, y: number, target: DragTarget) => void;
  finish: () => void;
  clear: () => void;
};

let timer: number | undefined;

export const useDrag = create<DragState>((set, get) => ({
  item: null,
  x: 0,
  y: 0,
  over: false,
  target: "none",
  consuming: false,

  begin: (item, x, y) => {
    window.clearTimeout(timer);
    set({ item, x, y, over: false, target: "none", consuming: false });
  },

  move: (x, y, target) => set({ x, y, target, over: target === "delete" }),

  finish: () => {
    const { item, target } = get();
    if (!item) return;

    if (target === "assistant" && item.onAttach) {
      set({ item: null, over: false, target: "none", consuming: false });
      item.onAttach();
      return;
    }

    if (target !== "delete") {
      set({ item: null, over: false, target: "none", consuming: false });
      return;
    }

    set({ consuming: true });

    timer = window.setTimeout(() => {
      const dropped = get().item;
      set({ item: null, over: false, target: "none", consuming: false });
      dropped?.onDrop();
    }, 360);
  },

  clear: () => {
    window.clearTimeout(timer);
    set({ item: null, over: false, target: "none", consuming: false });
  },
}));
