import { waveGenres } from "@/lib/genres";

type Props = {
  value: string;
  onChange: (id: string) => void;
};

export default function WaveGenres({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Жанр волны"
      className="w-full overflow-x-auto rounded-2xl border border-line bg-surface2/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible"
    >
      <div className="flex w-max gap-0.5 sm:w-full sm:flex-wrap sm:justify-center">
        {waveGenres.map((genre) => {
          const active = genre.id === value;

          return (
            <button
              key={genre.id || "all"}
              onClick={() => onChange(genre.id)}
              aria-pressed={active}
              className={`h-7 shrink-0 rounded-xl px-2.5 text-[11.5px] leading-none transition-colors ${
                active ? "bg-ink text-bg" : "text-muted hover:text-ink"
              }`}
            >
              {genre.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
