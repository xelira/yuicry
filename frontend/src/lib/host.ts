import { Capacitor, registerPlugin } from "@capacitor/core";

type LegacyHost = {
  setPlaying: (playing: boolean) => void;
  setTheme: (theme: string) => void;
};

type PlaybackInfo = {
  title: string;
  artist: string;
  cover: string;
  playing: boolean;
  liked: boolean;
  position: number;
  duration: number;
};

type PlaybackPlugin = {
  update: (info: PlaybackInfo) => Promise<void>;
  stop: () => Promise<void>;
};

type HostPlugin = {
  setTheme: (options: { theme: "dark" | "light" }) => Promise<void>;
};

const Playback = registerPlugin<PlaybackPlugin>("Playback");
const Host = registerPlugin<HostPlugin>("Host");

function legacy(): Partial<LegacyHost> {
  if (typeof window === "undefined") return {};

  return (window as unknown as { YuicryHost?: Partial<LegacyHost> }).YuicryHost ?? {};
}

function native() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export function hostPlayback(info: PlaybackInfo) {
  if (native()) {
    void Playback.update(info).catch(() => undefined);
    return;
  }

  legacy().setPlaying?.(info.playing);
}

export function hostStop() {
  if (native()) {
    void Playback.stop().catch(() => undefined);
    return;
  }

  legacy().setPlaying?.(false);
}

export function hostTheme(theme: "dark" | "light") {
  if (native()) {
    void Host.setTheme({ theme }).catch(() => undefined);
    return;
  }

  legacy().setTheme?.(theme);
}
