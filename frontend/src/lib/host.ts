type Host = {
  setPlaying: (playing: boolean) => void;
  setTheme: (theme: string) => void;
};

function host(): Partial<Host> {
  if (typeof window === "undefined") return {};

  return (window as unknown as { YuicryHost?: Partial<Host> }).YuicryHost ?? {};
}

export function hostPlaying(playing: boolean) {
  host().setPlaying?.(playing);
}

export function hostTheme(theme: "dark" | "light") {
  host().setTheme?.(theme);
}
