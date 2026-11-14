import { useAssistant } from "@/store/assistantStore";
import type { Track } from "@/store/playerStore";

export function attachTrack(track: Track) {
  useAssistant.getState().attach({
    kind: "track",
    id: track.id,
    title: track.title,
    artist: track.artist,
    cover: track.cover_big,
  });
}

export function attachPlaylist(album: {
  id: string;
  title: string;
  cover?: string;
  count?: number;
}) {
  useAssistant.getState().attach({
    kind: "playlist",
    id: album.id,
    title: album.title,
    cover: album.cover,
    count: album.count,
  });
}
