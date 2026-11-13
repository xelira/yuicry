let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let buffer: Uint8Array<ArrayBuffer> | null = null;
let element: HTMLAudioElement | null = null;

export type Levels = {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
};

const silence: Levels = { bass: 0, mid: 0, treble: 0, energy: 0 };
const emptySpectrum = new Uint8Array(64);

export function audioElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio();
    element.preload = "auto";

    if (typeof window !== "undefined") {
      (window as unknown as { __yuicryAudio?: HTMLAudioElement }).__yuicryAudio = element;
    }
  }
  return element;
}

export function attachAudio(target: HTMLAudioElement) {
  if (context) {
    void context.resume();
    return;
  }

  const start = () => {
    if (context) return;

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(target);
      const node = ctx.createAnalyser();

      node.fftSize = 512;
      node.smoothingTimeConstant = 0.82;

      source.connect(node);
      node.connect(ctx.destination);

      context = ctx;
      analyser = node;
      buffer = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
    } catch (error) {
      context = null;
    }
  };

  target.addEventListener("play", start, { once: true });
}

export function levels(): Levels {
  if (!analyser || !buffer) return silence;

  analyser.getByteFrequencyData(buffer);

  const size = buffer.length;
  const bassEnd = Math.max(1, Math.floor(size * 0.14));
  const midEnd = Math.max(bassEnd + 1, Math.floor(size * 0.55));

  let bass = 0;
  let mid = 0;
  let treble = 0;

  for (let i = 0; i < size; i += 1) {
    const value = buffer[i] / 255;
    if (i < bassEnd) bass += value;
    else if (i < midEnd) mid += value;
    else treble += value;
  }

  return {
    bass: bass / bassEnd,
    mid: mid / Math.max(1, midEnd - bassEnd),
    treble: treble / Math.max(1, size - midEnd),
    energy: (bass + mid + treble) / size,
  };
}

export function spectrum(): Uint8Array {
  if (!analyser || !buffer) return emptySpectrum;
  analyser.getByteFrequencyData(buffer);
  return buffer;
}

export function playTrack(id: string) {
  const audio = audioElement();
  const url = `/api/stream/${id}`;
  const absolute = new URL(url, window.location.origin).href;

  if (audio.src !== absolute) {
    audio.src = url;
    audio.load();
  }

  void audio.play().catch(() => undefined);
}

export function warmTrack(id: string) {
  fetch(`/api/stream/${id}`, { method: "HEAD" }).catch(() => undefined);
}

export function coverSource(url: string) {
  if (!url) return "";
  return `/api/cover?url=${encodeURIComponent(url)}`;
}
