// tools/make-icons.js — resize the generated 1024px icon sources into the
// exact sizes the PWA manifest and the Play Store need.
//
// No npm dependencies: this drives the browser's own canvas through the
// already-installed Playwright-less path... which we don't have offline.
// So instead it uses a tiny pure-JS PNG pipeline:
//   decode PNG -> nearest/bilinear resize -> re-encode PNG
// That is enough for square icon downscales and keeps the "no runtime deps,
// no npm install" promise of the project intact.
//
// Run: node tools/make-icons.js

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(ROOT, 'src', 'assets', 'art');
const OUT_DIR = join(ROOT, 'src', 'assets', 'icons');

// ---------- minimal PNG decode ----------

function readChunks(buf) {
  let off = 8; // skip signature
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len; // len + type + data + crc
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode a non-interlaced 8-bit RGB/RGBA PNG into {width, height, rgba}. */
function decodePng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('not a PNG (no IHDR)');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported colour type ${colorType}`);

  const channels = colorType === 6 ? 4 : 3;
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);

  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: line[i] = (line[i] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`bad filter ${filter}`);
      }
    }

    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      rgba[d] = line[s];
      rgba[d + 1] = line[s + 1];
      rgba[d + 2] = line[s + 2];
      rgba[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}

// ---------- minimal PNG encode ----------

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- resize (box filter: good quality for downscales) ----------

function resize(src, size, crop = 0, outH = null) {
  const { width: sw, height: sh, rgba } = src;
  const height = outH || size;
  // crop is a fraction trimmed from every edge, used to remove the rounded
  // corners the image model draws (Android applies its own mask)
  const x0 = Math.round(sw * crop), y0 = Math.round(sh * crop);
  let cw = sw - x0 * 2, ch = sh - y0 * 2;

  // For a non-square target, centre-crop the source to the target aspect
  // first, so the art is never squashed.
  let cx = x0, cy = y0;
  const targetAspect = size / height;
  if (Math.abs(cw / ch - targetAspect) > 0.001) {
    if (cw / ch > targetAspect) {
      const newW = Math.round(ch * targetAspect);
      cx += Math.round((cw - newW) / 2);
      cw = newW;
    } else {
      const newH = Math.round(cw / targetAspect);
      cy += Math.round((ch - newH) / 2);
      ch = newH;
    }
  }
  const y0c = cy, x0c = cx;

  const out = Buffer.alloc(size * height * 4);
  const sx = cw / size, sy = ch / height;

  for (let y = 0; y < height; y++) {
    const ys = y0c + y * sy, ye = y0c + (y + 1) * sy;
    const yi0 = Math.floor(ys), yi1 = Math.min(sh, Math.ceil(ye));
    for (let x = 0; x < size; x++) {
      const xs = x0c + x * sx, xe = x0c + (x + 1) * sx;
      const xi0 = Math.floor(xs), xi1 = Math.min(sw, Math.ceil(xe));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = yi0; yy < yi1; yy++) {
        for (let xx = xi0; xx < xi1; xx++) {
          const i = (yy * sw + xx) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3];
          n++;
        }
      }
      const d = (y * size + x) * 4;
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
      out[d + 3] = Math.round(a / n);
    }
  }
  return { width: size, height, rgba: out };
}

// ---------- main ----------

const TARGETS = [
  // [source file, crop fraction, output name, size]
  ['icon-source.png', 0.06, 'icon-192.png', 192],
  ['icon-source.png', 0.06, 'icon-512.png', 512],
  ['icon-maskable-source.png', 0.00, 'icon-maskable-192.png', 192],
  ['icon-maskable-source.png', 0.00, 'icon-maskable-512.png', 512],
  // Play Store listing requires exactly 512x512
  ['icon-source.png', 0.06, 'play-store-512.png', 512],
  // Play Store feature graphic: exactly 1024x500
  ['feature-graphic-source.png', 0.00, 'feature-graphic.png', 1024, 500],
];

await mkdir(OUT_DIR, { recursive: true });

const cache = new Map();
async function load(name) {
  if (!cache.has(name)) cache.set(name, decodePng(await readFile(join(SRC_DIR, name))));
  return cache.get(name);
}

for (const [srcName, crop, outName, size, outH] of TARGETS) {
  const src = await load(srcName);
  const small = resize(src, size, crop, outH || null);
  const png = encodePng(small.width, small.height, small.rgba);
  await writeFile(join(OUT_DIR, outName), png);
  console.log(`  ${outName.padEnd(26)} ${small.width}x${small.height}  ${Math.round(png.length / 1024)} KB`);
}

console.log(`\n${TARGETS.length} icons written to ${OUT_DIR.slice(ROOT.length)}`);