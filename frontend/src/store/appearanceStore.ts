import { create } from "zustand";

export type BackgroundId = "aurora" | "contour" | "moire" | "halftone" | "blueprint" | "weave";

export const backgrounds: {
  id: BackgroundId;
  name: string;
  text: string;
}[] = [
  { id: "aurora", name: "Основной", text: "Свечение обложки" },
  { id: "contour", name: "Топография", text: "Линии рельефа" },
  { id: "moire", name: "Моар", text: "Интерференция" },
  { id: "halftone", name: "Полутон", text: "Печатные точки" },
  { id: "blueprint", name: "Чертёж", text: "Технические линии" },
  { id: "weave", name: "Ткань", text: "Плетение" },
];

const legacy: Record<string, BackgroundId> = {
  particles: "halftone",
  waves: "contour",
  grid: "blueprint",
  rings: "moire",
  mesh: "weave",
};

const key = "yuicry-background";

function isBackground(value: string): value is BackgroundId {
  return backgrounds.some((item) => item.id === value);
}

export function readBackground(): BackgroundId {
  if (typeof window === "undefined") return "aurora";

  try {
    const value = localStorage.getItem(key);
    if (value && isBackground(value)) return value;
    return value && legacy[value] ? legacy[value] : "aurora";
  } catch (error) {
    return "aurora";
  }
}

type AppearanceState = {
  background: BackgroundId;
  setBackground: (background: BackgroundId) => void;
};

export const useAppearance = create<AppearanceState>((set) => ({
  background: readBackground(),

  setBackground: (background) => {
    set({ background });

    try {
      localStorage.setItem(key, background);
    } catch (error) {
      return;
    }
  },
}));
