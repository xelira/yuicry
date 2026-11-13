export type WaveGenre = {
  id: string;
  label: string;
};

export const waveGenres: WaveGenre[] = [
  { id: "", label: "Все" },
  { id: "132", label: "Поп" },
  { id: "116", label: "Рэп и хип-хоп" },
  { id: "152", label: "Рок" },
  { id: "106", label: "Электроника" },
  { id: "113", label: "Танцевальная" },
  { id: "165", label: "R&B" },
  { id: "85", label: "Альтернатива" },
  { id: "464", label: "Метал" },
  { id: "144", label: "Регги" },
  { id: "129", label: "Джаз" },
  { id: "169", label: "Соул и фанк" },
  { id: "466", label: "Фолк" },
  { id: "197", label: "Латино" },
  { id: "98", label: "Классика" },
];

export function genreLabel(id: string): string {
  return waveGenres.find((genre) => genre.id === id)?.label ?? "Все";
}
