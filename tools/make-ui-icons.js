// tools/make-ui-icons.js — turn the generated UI art into small transparent
// icons: power bar, mode menu and difficulty picker.
//
// The image model always returns an opaque image, so the icons arrive with a
// near-white background that would show as a pale square on the white power
// button. This flood-fills the background to transparent from the edges
// inwards — edge-seeded, so a white highlight *inside* the drawing (an eye, a
// card face) is never eaten.
//
// Run: node tools/make-power-icons.js

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, resizeTo } from './png-lib.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src', 'assets', 'art');
const OUT = join(ROOT, 'src', 'assets', 'icons', 'ui');

const ICONS = [
  // power bar
  'power-peek', 'power-ace-call', 'power-reshuffle',
  'power-reserve', 'power-undo', 'power-time',
  // main menu
  'mode-adventure', 'mode-timed', 'mode-tide', 'mode-classic',
  'mode-journey', 'mode-daily', 'mode-contract', 'mode-ascension', 'mode-zen',
  // difficulty picker
  'diff-gentle', 'diff-standard', 'diff-sharp', 'diff-suited', 'diff-brutal',
  // battle mode
  'mode-battle', 'battle-strike', 'battle-guard', 'battle-focus', 'battle-surge',
  'boss-gardien', 'boss-illusionniste', 'boss-horloger', 'boss-souveraine',
];

const SIZE = 128;          // drawn at 26-34px, so 128 covers 4x displays
const TOLERANCE = 30;      // how far from the corner colour still counts as background
const FEATHER = 1.6;       // soften the cut so edges don't look jagged

/**
 * Make the background transparent by flooding from the border inwards.
 * Seeding from the edges is what protects white *inside* the artwork.
 */
function cutBackground(img) {
  const { width: w, height: h, rgba } = img;
  const at = (x, y) => (y * w + x) * 4;

  // sample the four corners; the background is whatever they agree on
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
    const i = at(x, y);
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  });
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, k) => s + k[c], 0) / 4));

  const near = (i) => {
    const d = Math.abs(rgba[i] - bg[0]) + Math.abs(rgba[i + 1] - bg[1]) + Math.abs(rgba[i + 2] - bg[2]);
    return d <= TOLERANCE * 3;
  };

  // iterative flood fill (a recursive one blows the stack at 1024x1024)
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0); stack.push(x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y); stack.push(w - 1, y); }

  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!near(i)) continue;
    seen[p] = 1;
    rgba[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  // Feather: any still-opaque pixel touching a cleared one gets partial alpha,
  // so the outline reads smoothly instead of showing stair-steps.
  const copy = Uint8Array.from(seen);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (copy[p]) continue;
      let cleared = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (copy[(y + dy) * w + (x + dx)]) cleared++;
      }
      if (cleared) rgba[p * 4 + 3] = Math.max(0, 255 - Math.round(cleared * 255 / (4 * FEATHER)));
    }
  }
  return img;
}

/** Trim fully transparent margins so every icon fills its button equally. */
function trim(img) {
  const { width: w, height: h, rgba } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img; // fully transparent, nothing to trim

  // keep it square so nothing is distorted, with a small breathing margin
  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const pad = Math.round(side * 0.06);
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  const half = Math.round(side / 2) + pad;

  const s = half * 2;
  const out = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    const sy = cy - half + y;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < s; x++) {
      const sx = cx - half + x;
      if (sx < 0 || sx >= w) continue;
      const si = (sy * w + sx) * 4, di = (y * s + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return { width: s, height: s, rgba: out };
}

await mkdir(OUT, { recursive: true });

let total = 0;
let missing = 0;
for (const name of ICONS) {
  let raw;
  try {
    raw = await readFile(join(SRC, `${name}.png`));
  } catch {
    console.log(`  ${name.padEnd(20)} (not generated yet — skipped)`);
    missing++;
    continue;
  }
  const img = decodePng(raw);
  const cut = trim(cutBackground(img));
  const small = resizeTo(cut, SIZE, SIZE);
  const png = encodePng(SIZE, SIZE, small.rgba);
  await writeFile(join(OUT, `${name}.png`), png);
  total += png.length;
  console.log(`  ${name.padEnd(20)} ${cut.width}px -> ${SIZE}px  ${Math.round(png.length / 1024)} KB`);
}

console.log(`\n${ICONS.length} power icons, ${Math.round(total / 1024)} KB total, in ${OUT.slice(ROOT.length)}`);