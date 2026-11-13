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
      className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible"
    >
      <div className="flex w-max gap-1.5 sm:w-full sm:flex-wrap sm:justify-center">
        {waveGenres.map((genre) => {
          const active = genre.id === value;

          return (
            <button
              key={genre.id || "all"}
              onClick={() => onChange(genre.id)}
              aria-pressed={active}
              className={`h-8 shrink-0 rounded-full border px-3.5 text-[12px] transition-colors ${
                active
                  ? "border-lineStrong bg-surface2 text-ink"
                  : "border-line text-muted hover:border-lineStrong hover:text-ink"
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
