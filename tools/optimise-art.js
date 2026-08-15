// tools/optimise-art.js — downscale the generated art to the size it is
// actually displayed at.
//
// The image model returns 1024x1536 PNGs. A card is drawn at roughly 130px
// wide on a phone and 190px on a desktop, so shipping 1024px costs ~46 MB for
// no visible gain. Halving to 512px keeps the art crisp on the highest-DPI
// screens while cutting the payload by about 4x — which matters a great deal
// inside an APK.
//
// The 1024px sources stay in the repo (as *-source.png where relevant); this
// only rewrites what is served.
//
// Run: node tools/optimise-art.js [--max 512] [--dry-run]

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, resizeTo } from './png-lib.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ART = join(ROOT, 'src', 'assets', 'art');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const maxIdx = args.indexOf('--max');
const MAX_W = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 512;

const files = (await readdir(ART)).filter((f) => f.endsWith('.png') && !f.includes('-source'));

/**
 * Per-asset width caps. Cards are drawn ~130-190px wide so 512 is generous,
 * but the table is stretched across the whole screen and would visibly blur
 * at that size, so it keeps more pixels.
 */
function capFor(name) {
  if (name.startsWith('table-')) return 1024;
  return MAX_W;
}

let before = 0, after = 0;
for (const name of files) {
  const path = join(ART, name);
  const buf = await readFile(path);
  before += buf.length;

  const img = decodePng(buf);
  const cap = capFor(name);
  if (img.width <= cap) {
    after += buf.length;
    console.log(`  ${name.padEnd(28)} ${img.width}px  (already small)`);
    continue;
  }

  const scale = cap / img.width;
  const w = cap, h = Math.round(img.height * scale);
  const small = resizeTo(img, w, h);
  const out = encodePng(w, h, small.rgba);

  if (!dryRun) await writeFile(path, out);
  after += out.length;
  console.log(`  ${name.padEnd(28)} ${img.width}x${img.height} -> ${w}x${h}   ${Math.round(buf.length/1024)}KB -> ${Math.round(out.length/1024)}KB`);
}

console.log(`\nTotal: ${(before/1024/1024).toFixed(1)} MB -> ${(after/1024/1024).toFixed(1)} MB`
  + `  (${Math.round((1 - after/before) * 100)}% smaller)`);
if (dryRun) console.log('Dry run — nothing written.');
