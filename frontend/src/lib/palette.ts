import { coverSource } from "@/lib/audio";

export type Palette = [string, string, string];

export const fallbackPalette: Palette = ["#e0502a", "#3a2f7a", "#177a84"];

const fallback = fallbackPalette;
const CACHE_KEY = "yuicry:palettes";
const CACHE_LIMIT = 80;

function readCache(): Record<string, Palette> {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function cached(url: string): Palette | null {
  const value = readCache()[url];
  return Array.isArray(value) && value.length === 3 ? (value as Palette) : null;
}

function remember(url: string, palette: Palette) {
  if (typeof window === "undefined") return;

  try {
    const cache = readCache();
    cache[url] = palette;

    const keys = Object.keys(cache);
    for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) {
      delete cache[key];
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    return;
  }
}

function luma(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (part: number) => {
    const normalized = part / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  const r = channel((value >> 16) & 255);
  const g = channel((value >> 8) & 255);
  const b = channel(value & 255);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyAuroraTone(palette: Palette) {
  if (typeof document === "undefined") return;

  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";

  if (theme === "light") {
    document.documentElement.dataset.aurora = "light";
    return;
  }

  const average = palette.reduce((sum, color) => sum + luma(color), 0) / palette.length;
  const effective = average * 0.67 + 0.0017;

  document.documentElement.dataset.aurora = effective > 0.45 ? "light" : "dark";
}

function toHex(r: number, g: number, b: number) {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function shade(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const scale = luma > 150 ? factor * 0.75 : factor;

  return toHex(r * scale, g * scale, b * scale);
}

function adjust(color: number[], index: number) {
  const [r, g, b] = color;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const delta = max - min;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (delta !== 0) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;

    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  const saturation = s < 0.22 ? 0.45 : Math.min(s * 1.2, 0.92);
  const hue = s < 0.22 ? (212 + index * 34) % 360 : h;

  const c = (1 - Math.abs(2 * l - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  let rgb: number[];

  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return rgb.map((value) => (value + m) * 255);
}

function distance(left: number[], right: number[]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export async function paletteFromCover(url: string): Promise<Palette> {
  if (!url) return fallback;

  const hit = cached(url);
  if (hit) return hit;

  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = coverSource(url, "small");
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;

    const context = canvas.getContext("2d");
    if (!context) return fallback;

    context.drawImage(image, 0, 0, 48, 48);
    const { data } = context.getImageData(0, 0, 48, 48);

    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const alpha = data[i + 3];

      if (alpha < 200) continue;

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma < 26 || luma > 232) continue;

      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };

      entry.count += 1;
      entry.r += r;
      entry.g += g;
      entry.b += b;
      buckets.set(key, entry);
    }

    const scored = [...buckets.values()]
      .map((entry) => {
        const r = entry.r / entry.count;
        const g = entry.g / entry.count;
        const b = entry.b / entry.count;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        return {
          color: [r, g, b],
          score: entry.count * (0.35 + saturation * 1.9) * (0.35 + luma / 255),
        };
      })
      .sort((left, right) => right.score - left.score);

    const picked: number[][] = [];

    for (const entry of scored) {
      if (picked.length === 3) break;
      if (picked.every((item) => distance(item, entry.color) > 42)) {
        picked.push(entry.color);
      }
    }

    if (picked.length === 0) return fallback;

    while (picked.length < 3) {
      const base = picked[picked.length - 1];
      const factor = picked.length === 1 ? 1.4 : 0.65;
      picked.push([base[0] * factor, base[1] * factor, base[2] * factor]);
    }

    const brightened = picked.map((color, index) => {
      const [r, g, b] = adjust(color, index);
      return toHex(r, g, b);
    });

    const palette: Palette = [
      shade(brightened[0], 0.85),
      shade(brightened[1], 0.95),
      shade(brightened[2], 1.05),
    ];

    remember(url, palette);
    return palette;
  } catch (error) {
    return fallback;
  }
}
