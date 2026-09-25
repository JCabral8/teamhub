// Draws the colour wheel images in assets/: a hue/saturation disc (hue clockwise from the right,
// saturation from centre to edge, full brightness) and a fade to black for the brightness slider.
// Run with `node scripts/generate-color-wheel.mjs`; ColorWheel.tsx uses the same geometry.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function png(width, height, pixel) {
  // Each row uses PNG's "Sub" filter (difference from the pixel to the left): gradients compress far better.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 1;
    let left = [0, 0, 0, 0];
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y);
      raw.set(px.map((v, i) => (v - left[i] + 256) & 255), row + 1 + x * 4);
      left = px;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)];
}

const SIZE = 480;
const r = SIZE / 2;
writeFileSync(
  'assets/color-wheel.png',
  png(SIZE, SIZE, (x, y) => {
    const dx = x + 0.5 - r;
    const dy = y + 0.5 - r;
    const d = Math.hypot(dx, dy);
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const alpha = Math.max(0, Math.min(1, r - d)) * 255; // one pixel of anti-aliasing at the rim
    return [...hsvToRgb(hue, Math.min(1, d / r), 1), Math.round(alpha)];
  }),
);
writeFileSync('assets/brightness-fade.png', png(256, 1, (x) => [0, 0, 0, 255 - x]));
