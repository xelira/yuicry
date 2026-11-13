import { Capacitor, registerPlugin } from "@capacitor/core";

type LegacyHost = {
  setPlaying: (playing: boolean) => void;
  setTheme: (theme: string) => void;
};

type PlaybackPlugin = {
  start: () => Promise<void>;
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

export function hostPlaying(playing: boolean) {
  if (native()) {
    void (playing ? Playback.start() : Playback.stop()).catch(() => undefined);
    return;
  }

  legacy().setPlaying?.(playing);
}

export function hostTheme(theme: "dark" | "light") {
  if (native()) {
    void Host.setTheme({ theme }).catch(() => undefined);
    return;
  }

  legacy().setTheme?.(theme);
}
