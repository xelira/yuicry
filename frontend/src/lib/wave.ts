import { warmTrack } from "@/lib/audio";
import { waveGenres } from "@/lib/genres";
import { usePlayer, type Track } from "@/store/playerStore";

const genreKey = "yuicry:wave-genre";

export function savedWaveGenre(): string {
  if (typeof window === "undefined") return "";

  const saved = window.localStorage.getItem(genreKey) ?? "";
  return waveGenres.some((genre) => genre.id === saved) ? saved : "";
}

export function rememberWaveGenre(id: string) {
  window.localStorage.setItem(genreKey, id);
}

export async function playWave(genre = savedWaveGenre()) {
  const query = genre ? `?genre=${encodeURIComponent(genre)}` : "";
  const response = await fetch(`/api/wave${query}`);
  if (!response.ok) return false;

  const data = await response.json();
  const tracks: Track[] = data.tracks ?? [];
  if (tracks.length === 0) return false;

  usePlayer.getState().playQueue(tracks);
  warmTrack(tracks[0].id);

  return true;
}
