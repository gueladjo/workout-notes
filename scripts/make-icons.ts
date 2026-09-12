/**
 * Generate the PWA icons (PNG) and favicon (SVG) without any image library: a rounded blue square
 * with a white dumbbell, rasterised by hand and encoded with Node's zlib.
 *
 *   npm run make-icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const BG = [0x1e, 0x6f, 0xd9];
const FG = [0xff, 0xff, 0xff];

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(crcInput));
  const out = new Uint8Array(4 + crcInput.length + 4);
  out.set(len);
  out.set(crcInput, 4);
  out.set(crc, 4 + crcInput.length);
  return out;
}

function encodePng(size: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Signed distance helpers on a unit square [0,1]. */
function roundedRect(x: number, y: number, cx: number, cy: number, w: number, h: number, r: number): number {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Dumbbell: bar + two plates each side, all rounded rects, centred, in unit coordinates. */
function dumbbell(x: number, y: number): number {
  const parts = [
    roundedRect(x, y, 0.5, 0.5, 0.56, 0.08, 0.03), // bar
    roundedRect(x, y, 0.27, 0.5, 0.09, 0.42, 0.03), // left outer plate
    roundedRect(x, y, 0.36, 0.5, 0.07, 0.3, 0.025), // left inner plate
    roundedRect(x, y, 0.73, 0.5, 0.09, 0.42, 0.03), // right outer plate
    roundedRect(x, y, 0.64, 0.5, 0.07, 0.3, 0.025), // right inner plate
  ];
  return Math.min(...parts);
}

function render(size: number, opts: { maskable: boolean; transparentBg: boolean }): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const ss = 3; // supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          const bgDist = opts.maskable ? -1 : roundedRect(x, y, 0.5, 0.5, 1, 1, 0.22);
          const inBg = bgDist <= 0;
          const scale = opts.maskable ? 0.72 : 0.86;
          const lx = (x - 0.5) / scale + 0.5;
          const ly = (y - 0.5) / scale + 0.5;
          const inFg = dumbbell(lx, ly) <= 0;
          if (inFg) {
            r += FG[0]!;
            g += FG[1]!;
            b += FG[2]!;
            a += 255;
          } else if (inBg) {
            r += BG[0]!;
            g += BG[1]!;
            b += BG[2]!;
            a += 255;
          } else if (!opts.transparentBg) {
            r += 255;
            g += 255;
            b += 255;
            a += 255;
          }
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      // premultiplied average -> straight alpha
      const alpha = a / n;
      rgba[i] = alpha ? Math.round(r / n / (alpha / 255)) : 0;
      rgba[i + 1] = alpha ? Math.round(g / n / (alpha / 255)) : 0;
      rgba[i + 2] = alpha ? Math.round(b / n / (alpha / 255)) : 0;
      rgba[i + 3] = Math.round(alpha);
    }
  }
  return rgba;
}

for (const [name, size, maskable, transparent] of [
  ['icon-192.png', 192, false, true],
  ['icon-512.png', 512, false, true],
  ['icon-maskable-512.png', 512, true, false],
  ['apple-touch-icon.png', 180, true, false],
] as const) {
  writeFileSync(join(OUT, name), encodePng(size, render(size, { maskable, transparentBg: transparent })));
  console.log('wrote', name);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#1e6fd9"/>
<g fill="#fff" transform="translate(50 50) scale(0.86) translate(-50 -50)">
<rect x="22" y="46" width="56" height="8" rx="3"/>
<rect x="22.5" y="29" width="9" height="42" rx="3"/><rect x="32.5" y="35" width="7" height="30" rx="2.5"/>
<rect x="68.5" y="29" width="9" height="42" rx="3"/><rect x="60.5" y="35" width="7" height="30" rx="2.5"/>
</g></svg>
`;
writeFileSync(join(OUT, 'icon.svg'), svg);
console.log('wrote icon.svg');
