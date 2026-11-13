import { usePlayer, type Track } from "@/store/playerStore";

export async function playSimilar(track: Track) {
  const response = await fetch(`/api/similar/${track.id}`);
  if (!response.ok) return;

  const data = await response.json();
  if (data.tracks?.length) {
    usePlayer.getState().playQueue(data.tracks);
  }
}
