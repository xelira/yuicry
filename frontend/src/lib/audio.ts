let element: HTMLAudioElement | null = null;

export type Levels = {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
};

const silence: Levels = { bass: 0, mid: 0, treble: 0, energy: 0 };
const emptySpectrum = new Uint8Array(64);

let phase = 0;
let smoothBass = 0;
let smoothMid = 0;
let smoothTreble = 0;

export function audioElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");
    (element as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;

    if (typeof document !== "undefined") {
      element.style.display = "none";
      document.body.appendChild(element);
    }

    if (typeof window !== "undefined") {
      (window as unknown as { __yuicryAudio?: HTMLAudioElement }).__yuicryAudio = element;
    }
  }
  return element;
}

function mix(time: number, base: number, speed: number, offset: number) {
  const first = Math.sin(time * speed + offset);
  const second = Math.sin(time * speed * 0.37 + offset * 1.7);
  return base + first * 0.22 + second * 0.14;
}

export function levels(): Levels {
  const audio = element;
  const playing = Boolean(audio && !audio.paused && !audio.ended);

  phase += playing ? 0.028 : 0.008;

  const bass = Math.max(0, Math.min(1, mix(phase, 0.52, 1.6, 0)));
  const mid = Math.max(0, Math.min(1, mix(phase, 0.48, 2.4, 2.1)));
  const treble = Math.max(0, Math.min(1, mix(phase, 0.42, 3.3, 4.2)));

  smoothBass += (bass - smoothBass) * 0.18;
  smoothMid += (mid - smoothMid) * 0.18;
  smoothTreble += (treble - smoothTreble) * 0.18;

  const scale = playing ? 1 : 0.35;

  return {
    bass: smoothBass * scale,
    mid: smoothMid * scale,
    treble: smoothTreble * scale,
    energy: ((smoothBass + smoothMid + smoothTreble) / 3) * scale,
  };
}

export function spectrum(): Uint8Array {
  return emptySpectrum;
}

export function streamSource(id: string) {
  return `/api/stream/${id}?v=2`;
}

export function previewSource(id: string) {
  return `/api/preview/${id}?v=2`;
}

export function playTrack(id: string) {
  const audio = audioElement();
  const url = previewSource(id);
  const absolute = new URL(url, window.location.origin).href;

  if (audio.src !== absolute) {
    audio.src = url;
    audio.load();
  }

  void audio.play().catch(() => undefined);
}

export function warmTrack(id: string) {
  fetch(`/api/download/${id}`, { method: "POST" }).catch(() => undefined);
}

export type CoverSize = "small" | "medium" | "large";

export function coverSource(url: string, size: CoverSize = "medium") {
  if (!url) return "";
  return `/api/cover?size=${size}&url=${encodeURIComponent(url)}`;
}
