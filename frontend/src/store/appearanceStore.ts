import { create } from "zustand";

export type BackgroundId =
  | "aurora"
  | "contour"
  | "blackhole"
  | "field"
  | "film"
  | "glass";

export const backgrounds: {
  id: BackgroundId;
  name: string;
  text: string;
}[] = [
  { id: "aurora", name: "Основной", text: "Свечение обложки" },
  { id: "contour", name: "Топография", text: "Линии рельефа" },
  { id: "blackhole", name: "Чёрная дыра", text: "Горизонт событий" },
  { id: "field", name: "Поле", text: "Силовые линии" },
  { id: "film", name: "Плёнка", text: "Кадры и зерно" },
  { id: "glass", name: "Витраж", text: "Цветные грани" },
];

const legacy: Record<string, BackgroundId> = {
  particles: "film",
  waves: "contour",
  grid: "field",
  rings: "blackhole",
  mesh: "glass",
  moire: "blackhole",
  halftone: "film",
  blueprint: "field",
  weave: "glass",
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
