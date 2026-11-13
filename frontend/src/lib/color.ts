export type Accent = {
  color: string;
  rgb: string;
  text: string;
  textRgb: string;
};

export type Hsv = {
  h: number;
  s: number;
  v: number;
};

const accentKey = "yuicry-accent";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

export function hexToRgb(hex: string) {
  const value = hex.replace("#", "").trim();
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;

  if (!/^[0-9a-f]{6}$/i.test(full)) return null;

  const number = parseInt(full, 16);

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number) {
  const part = (value: number) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");

  return `#${part(r)}${part(g)}${part(b)}`;
}

export function hexToHsv(hex: string): Hsv {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 12, s: 79, v: 100 };

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;

  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  if (h < 0) h += 360;

  return {
    h: Math.round(h),
    s: Math.round(max > 0 ? (delta / max) * 100 : 0),
    v: Math.round(max * 100),
  };
}

export function hsvToHex(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s) / 100;
  const value = clamp(v) / 100;

  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function accentFromHex(hex: string): Accent {
  const rgb = hexToRgb(hex) ?? { r: 255, g: 90, b: 54 };
  const value = luminance(rgb.r, rgb.g, rgb.b);

  const dark = (value + 0.05) / 0.05;
  const light = 1.05 / (value + 0.05);
  const text = dark >= light ? "#141016" : "#fff6f3";
  const textRgb = hexToRgb(text) ?? { r: 20, g: 16, b: 22 };

  return {
    color: rgbToHex(rgb.r, rgb.g, rgb.b),
    rgb: `${rgb.r} ${rgb.g} ${rgb.b}`,
    text,
    textRgb: `${textRgb.r} ${textRgb.g} ${textRgb.b}`,
  };
}

export function readAccent(): Accent | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(accentKey);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<Accent>;
    if (!value.color || !value.rgb || !value.text || !value.textRgb) return null;

    return {
      color: value.color,
      rgb: value.rgb,
      text: value.text,
      textRgb: value.textRgb,
    };
  } catch (error) {
    return null;
  }
}

export function applyAccent(accent: Accent | null) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const style = root.style;

  if (!accent) {
    style.removeProperty("--accent");
    style.removeProperty("--accent-rgb");
    style.removeProperty("--accent-text");
    style.removeProperty("--accent-text-rgb");

    try {
      localStorage.removeItem(accentKey);
    } catch (error) {
      return;
    }

    window.dispatchEvent(new CustomEvent("yuicry:accent", { detail: null }));
    return;
  }

  style.setProperty("--accent", accent.color);
  style.setProperty("--accent-rgb", accent.rgb);
  style.setProperty("--accent-text", accent.text);
  style.setProperty("--accent-text-rgb", accent.textRgb);

  try {
    localStorage.setItem(accentKey, JSON.stringify(accent));
  } catch (error) {
    return;
  }

  window.dispatchEvent(new CustomEvent("yuicry:accent", { detail: accent.color }));
}

export function currentAccent(): string {
  if (typeof document === "undefined") return "#ff5a36";

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();

  return value || "#ff5a36";
}
