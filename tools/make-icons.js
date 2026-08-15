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
import { decodePng, encodePng, resize } from './png-lib.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(ROOT, 'src', 'assets', 'art');
const OUT_DIR = join(ROOT, 'src', 'assets', 'icons');

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

// Android launcher icons. Android scales an adaptive foreground down to
// 72/108 of its canvas, so the foreground is generated larger than the
// nominal density size to survive that crop at full resolution.
const ANDROID_DIR = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const ANDROID_TARGETS = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432],
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
// ---------- Android launcher icons ----------

const maskable = await load('icon-maskable-source.png');
const legacySrc = await load('icon-source.png');

for (const [dir, size] of ANDROID_TARGETS) {
  const outDir = join(ANDROID_DIR, dir);
  await mkdir(outDir, { recursive: true });

  // adaptive foreground: the maskable art, safe under any launcher mask
  const fg = resize(maskable, size, 0);
  await writeFile(join(outDir, 'ic_launcher_foreground.png'), encodePng(fg.width, fg.height, fg.rgba));

  // legacy square icon for launchers predating adaptive icons (API < 26)
  const legacySize = Math.round(size * 0.44);
  const legacy = resize(legacySrc, legacySize, 0.06);
  const legacyPng = encodePng(legacy.width, legacy.height, legacy.rgba);
  await writeFile(join(outDir, 'ic_launcher.png'), legacyPng);
  await writeFile(join(outDir, 'ic_launcher_round.png'), legacyPng);

  console.log(`  ${dir.padEnd(20)} foreground ${size}px · legacy ${legacySize}px`);
}

console.log(`\n${ANDROID_TARGETS.length} launcher densities written to ${ANDROID_DIR.slice(ROOT.length)}`);
