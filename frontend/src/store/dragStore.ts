import { create } from "zustand";

export type DragKind = "playlist" | "track";

export type DragItem = {
  kind: DragKind;
  title: string;
  cover?: string;
  onDrop: () => void;
};

type DragState = {
  item: DragItem | null;
  x: number;
  y: number;
  over: boolean;
  consuming: boolean;
  begin: (item: DragItem, x: number, y: number) => void;
  move: (x: number, y: number, over: boolean) => void;
  finish: () => void;
  clear: () => void;
};

let timer: number | undefined;

export const useDrag = create<DragState>((set, get) => ({
  item: null,
  x: 0,
  y: 0,
  over: false,
  consuming: false,

  begin: (item, x, y) => {
    window.clearTimeout(timer);
    set({ item, x, y, over: false, consuming: false });
  },

  move: (x, y, over) => set({ x, y, over }),

  finish: () => {
    const { item, over } = get();
    if (!item) return;

    if (!over) {
      set({ item: null, over: false, consuming: false });
      return;
    }

    set({ consuming: true });

    timer = window.setTimeout(() => {
      const dropped = get().item;
      set({ item: null, over: false, consuming: false });
      dropped?.onDrop();
    }, 360);
  },

  clear: () => {
    window.clearTimeout(timer);
    set({ item: null, over: false, consuming: false });
  },
}));
