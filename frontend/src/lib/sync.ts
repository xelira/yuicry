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

export function watchPlayback(onState: (state: RemoteState) => void) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => undefined;
  }

  let stopped = false;
  let fallback: number | null = null;
  let source: EventSource | null = null;

  const stopFallback = () => {
    if (fallback !== null) {
      window.clearInterval(fallback);
      fallback = null;
    }
  };

  const startFallback = () => {
    if (fallback !== null) return;

    fallback = window.setInterval(async () => {
      const remote = await pullPlayback();
      if (!stopped && remote) onState(remote);
    }, 10000);
  };

  const connect = () => {
    source = new EventSource("/api/playback/stream");

    source.onopen = () => stopFallback();

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.track && data.device) onState(data as RemoteState);
      } catch (error) {
        return;
      }
    };

    source.onerror = () => {
      startFallback();
    };
  };

  connect();

  return () => {
    stopped = true;
    stopFallback();
    source?.close();
  };
}
