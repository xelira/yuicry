import type { Track } from "@/store/playerStore";

export type LyricLine = {
  time: number;
  text: string;
};

export type LyricsResult = {
  lines: LyricLine[];
  plain: string;
};

const timestamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(value: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of value.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(timestamp)];
    if (!stamps.length) continue;

    const text = raw.replace(timestamp, "").trim();
    if (!text) continue;

    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fraction = stamp[3] ? Number(stamp[3].padEnd(3, "0")) / 1000 : 0;

      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(track: Track): Promise<LyricsResult | null> {
  const params = new URLSearchParams({
    title: track.title,
    artist: track.artist,
    duration: String(track.duration || 0),
  });

  const response = await fetch(`/api/lyrics?${params.toString()}`);
  if (!response.ok) return null;

  const data = await response.json();
  const lines = data.synced ? parseLrc(data.synced) : [];

  if (lines.length > 0) {
    return { lines, plain: data.plain ?? "" };
  }

  if (data.plain) {
    return { lines: [], plain: data.plain };
  }

  return null;
}
