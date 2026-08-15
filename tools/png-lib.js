// tools/png-lib.js — a tiny dependency-free PNG codec.
//
// Enough to decode the 8-bit RGB/RGBA PNGs the image model returns, box-filter
// resize them, and write them back. Deliberately minimal: the project promises
// no npm dependencies, and this is the only image processing it needs.

import { inflateSync, deflateSync } from 'node:zlib';

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
export function decodePng(buf) {
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

export function encodePng(width, height, rgba) {
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

/** Resize to an exact width/height (box filter, good for downscales). */
export function resizeTo(src, outW, outH, crop = 0) {
  const { width: sw, height: sh, rgba } = src;
  const x0 = Math.round(sw * crop), y0 = Math.round(sh * crop);
  let cw = sw - x0 * 2, ch = sh - y0 * 2;

  // centre-crop the source to the target aspect so art is never squashed
  let cx = x0, cy = y0;
  const targetAspect = outW / outH;
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

  const out = Buffer.alloc(outW * outH * 4);
  const sx = cw / outW, sy = ch / outH;

  for (let y = 0; y < outH; y++) {
    const ys = cy + y * sy, ye = cy + (y + 1) * sy;
    const yi0 = Math.floor(ys), yi1 = Math.min(sh, Math.ceil(ye));
    for (let x = 0; x < outW; x++) {
      const xs = cx + x * sx, xe = cx + (x + 1) * sx;
      const xi0 = Math.floor(xs), xi1 = Math.min(sw, Math.ceil(xe));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = yi0; yy < yi1; yy++) {
        for (let xx = xi0; xx < xi1; xx++) {
          const i = (yy * sw + xx) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3];
          n++;
        }
      }
      const d = (y * outW + x) * 4;
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
      out[d + 3] = Math.round(a / n);
    }
  }
  return { width: outW, height: outH, rgba: out };
}

/** Square/aspect-preserving resize used by the icon pipeline. */
export function resize(src, size, crop = 0, outH = null) {
  return resizeTo(src, size, outH || size, crop);
}
