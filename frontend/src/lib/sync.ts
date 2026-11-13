import type { Track } from "@/store/playerStore";

export type RemoteState = {
  device: string;
  track: Track;
  position: number;
  playing: boolean;
  updated_at: number;
};

export function deviceId() {
  if (typeof window === "undefined") return "server";

  let id = localStorage.getItem("yuicry:device");

  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("yuicry:device", id);
  }

  return id;
}

export async function pushPlayback(track: Track, position: number, playing: boolean) {
  await fetch("/api/playback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: deviceId(), track, position, playing }),
  }).catch(() => undefined);
}

export async function pullPlayback(): Promise<RemoteState | null> {
  try {
    const response = await fetch("/api/playback");
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || !data.track || !data.device) return null;

    return data as RemoteState;
  } catch (error) {
    return null;
  }
}
