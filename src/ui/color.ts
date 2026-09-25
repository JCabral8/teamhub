// Colour math for Team accents: conversions for the colour wheel, readable variants of any accent,
// and picking a Team's colours out of its logo. Pure functions, no React.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const part = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Hue in degrees (0–360), saturation and value from 0 to 1. */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: f(5), g: f(3), b: f(1) };
}

export function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function luminance({ r, g, b }: RGB): number {
  const c = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Blend `a` toward `b`; t = 0 is `a`, t = 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

const WHITE = '#FFFFFF';
const INK = '#16191D';

export interface AccentPalette {
  /** The Team's colour as chosen: buttons, selected chips, calendar highlights. */
  accent: string;
  /** Text and icons drawn on top of `accent`. */
  onAccent: string;
  /** The accent darkened just enough to read as text or an icon on white (a yellow becomes mustard). */
  ink: string;
  /** A pale tint for backgrounds such as date blocks and badges. */
  soft: string;
}

export function accentPalette(hex: string): AccentPalette {
  const accent = hex.toUpperCase();
  let ink = accent;
  for (let t = 0.1; contrast(ink, WHITE) < 4.5 && t <= 1; t += 0.1) ink = mix(accent, INK, t);
  return {
    accent,
    onAccent: contrast(accent, WHITE) >= contrast(accent, INK) ? WHITE : INK,
    ink,
    soft: mix(accent, WHITE, 0.88),
  };
}

/**
 * The main colours in an image, most prominent first, from raw RGBA pixels (such as canvas
 * getImageData). Transparent, near-white, near-black and grey pixels are ignored, so a black and
 * white logo gives an empty list. Area counts most; vivid colours count a little more than dull ones.
 */
export function paletteFromPixels(data: ArrayLike<number>, max = 5): string[] {
  const BINS = 24;
  const bins = Array.from({ length: BINS }, () => ({ r: 0, g: 0, b: 0, count: 0, weight: 0 }));
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const { h, s, v } = rgbToHsv(rgb);
    if (s < 0.25 || v < 0.2) continue;
    const bin = bins[Math.floor(h / (360 / BINS)) % BINS];
    const weight = 0.5 + 0.5 * s;
    bin.r += rgb.r;
    bin.g += rgb.g;
    bin.b += rgb.b;
    bin.count += 1;
    bin.weight += weight;
    total += weight;
  }
  const picked: string[] = [];
  for (const bin of [...bins].sort((a, b) => b.weight - a.weight)) {
    if (picked.length >= max || !bin.count || bin.weight < total * 0.03) break;
    const color = { r: bin.r / bin.count, g: bin.g / bin.count, b: bin.b / bin.count };
    const near = picked.some((p) => {
      const q = hexToRgb(p);
      return Math.hypot(q.r - color.r, q.g - color.g, q.b - color.b) < 60;
    });
    if (!near) picked.push(rgbToHex(color));
  }
  return picked;
}
