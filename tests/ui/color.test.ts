import { describe, expect, it } from 'vitest';
import { accentPalette, contrast, hexToRgb, hsvToRgb, paletteFromPixels, rgbToHex, rgbToHsv } from '../../src/ui/color.ts';

const pixels = (...colors: [string, number, number?][]) =>
  colors.flatMap(([hex, n, alpha = 255]) => {
    const { r, g, b } = hexToRgb(hex);
    return Array.from({ length: n }, () => [r, g, b, alpha]).flat();
  });

describe('colour conversions', () => {
  it('round-trips hex, RGB and HSV', () => {
    for (const hex of ['#15803D', '#1F5FD1', '#FFCC00', '#000000', '#FFFFFF']) {
      const { h, s, v } = rgbToHsv(hexToRgb(hex));
      expect(rgbToHex(hsvToRgb(h, s, v))).toBe(hex);
    }
    expect(rgbToHex(hsvToRgb(0, 1, 1))).toBe('#FF0000');
    expect(rgbToHex(hsvToRgb(120, 1, 1))).toBe('#00FF00');
  });
});

describe('accentPalette', () => {
  it('keeps dark accents as they are and puts white text on them', () => {
    const p = accentPalette('#15803d');
    expect(p).toMatchObject({ accent: '#15803D', onAccent: '#FFFFFF', ink: '#15803D' });
  });

  it('darkens a light accent for text on white and uses dark text on top of it', () => {
    const p = accentPalette('#FFCC00');
    expect(p.onAccent).toBe('#16191D');
    expect(contrast(p.ink, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(p.ink).not.toBe('#FFCC00');
  });
});

describe('paletteFromPixels', () => {
  it('finds the main colours, most prominent first', () => {
    expect(paletteFromPixels(pixels(['#15803D', 60], ['#FFCC00', 30], ['#FFFFFF', 200]))).toEqual(['#15803D', '#FFCC00']);
  });

  it('ignores transparent, white, black and grey pixels', () => {
    expect(paletteFromPixels(pixels(['#C8102E', 10, 0], ['#FFFFFF', 50], ['#000000', 50], ['#808080', 50]))).toEqual([]);
  });

  it('merges shades of the same colour', () => {
    expect(paletteFromPixels(pixels(['#1F5FD1', 40], ['#2463D4', 40]))).toHaveLength(1);
  });
});
