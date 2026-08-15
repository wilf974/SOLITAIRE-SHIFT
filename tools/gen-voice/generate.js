// tools/gen-voice/generate.js — build-side ElevenLabs voice generation.
//
// SECURITY CONTRACT (identical to the art pipeline, do not weaken):
//   * ELEVENLABS_API_KEY is read from the environment or a local .env at
//     build time only.
//   * It is NEVER printed, logged, serialised, written to any output file,
//     embedded in any asset, or shipped to the browser.
//   * Generated audio is committed; the key is not. Players never need one.
//
// Usage:
//   node tools/gen-voice/generate.js              # generate what is missing
//   node tools/gen-voice/generate.js --force      # regenerate everything
//   node tools/gen-voice/generate.js --dry-run    # print the plan, call nothing
//   node tools/gen-voice/generate.js --voices     # list available voices

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from './lines.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT_DIR = join(ROOT, 'src', 'assets', 'voice');
const MANIFEST = join(OUT_DIR, 'manifest.json');

const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const API = 'https://api.elevenlabs.io/v1';

// ---------- key loading (never echoed) ----------

async function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  for (const p of [join(ROOT, '.env'), join(ROOT, '..', '.env')]) {
    try {
      const txt = await readFile(p, 'utf8');
      const m = txt.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/m);
      if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
    } catch { /* try the next candidate */ }
  }
  return null;
}

/** Strip anything key-shaped before it can reach a log. */
function scrub(s) {
  return String(s)
    .replace(/sk_[A-Za-z0-9]{20,}/g, 'sk_***REDACTED***')
    .replace(/xi-api-key["':\s]*[A-Za-z0-9_-]{20,}/gi, 'xi-api-key: ***REDACTED***');
}

// ---------- manifest ----------

async function loadManifest() {
  try { return JSON.parse(await readFile(MANIFEST, 'utf8')); }
  catch { return { version: 1, model: MODEL, entries: {} }; }
}
async function saveManifest(m) {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(m, null, 2) + '\n', 'utf8');
}
function lineHash(line) {
  return createHash('sha256')
    .update(`${MODEL}|${line.voiceId}|${line.text}|${JSON.stringify(line.settings || {})}`)
    .digest('hex').slice(0, 16);
}
async function exists(p) { try { await access(p); return true; } catch { return false; } }

// ---------- generation ----------

async function listVoices(key) {
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${scrub(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.voices || [];
}

async function speak(key, line) {
  const res = await fetch(`${API}/text-to-speech/${line.voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: line.text,
      model_id: MODEL,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.4,
        use_speaker_boost: true,
        ...(line.settings || {}),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${scrub(await res.text()).slice(0, 400)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---------- main ----------

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const wantVoices = args.includes('--voices');

const key = await loadKey();

if (wantVoices) {
  if (!key) { console.error('ELEVENLABS_API_KEY not found.'); process.exit(1); }
  const voices = await listVoices(key);
  console.log(`${voices.length} voice(s) available:\n`);
  for (const v of voices) {
    const labels = Object.entries(v.labels || {}).map(([k, val]) => `${k}=${val}`).join(' ');
    console.log(`  ${v.voice_id}  ${(v.name || '').padEnd(20)} ${labels}`);
  }
  process.exit(0);
}

const manifest = await loadManifest();
manifest.model = MODEL;

const todo = [];
for (const line of LINES) {
  const hash = lineHash(line);
  const file = `${line.id}.mp3`;
  const onDisk = await exists(join(OUT_DIR, file));
  const prev = manifest.entries[line.id];
  if (!force && onDisk && prev && prev.hash === hash) continue;
  todo.push({ line, hash, file });
}

console.log(`Model: ${MODEL}`);
console.log(`Output: ${OUT_DIR.slice(ROOT.length)}`);
console.log(`${LINES.length} line(s) requested, ${LINES.length - todo.length} cached, ${todo.length} to generate.`);

if (dryRun) {
  for (const t of todo) console.log(`  would speak  ${t.file.padEnd(28)} "${t.line.text}"`);
  console.log('\nDry run — no API calls made.');
  process.exit(0);
}

if (!todo.length) { console.log('Everything is up to date.'); process.exit(0); }

if (!key) {
  console.error('\nELEVENLABS_API_KEY not found.');
  console.error('Set it in the environment or a .env file (see .env.example).');
  console.error('The key is only used at build time and is never shipped to the browser.');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

let ok = 0, failed = 0;
for (const [i, t] of todo.entries()) {
  process.stdout.write(`[${i + 1}/${todo.length}] ${t.file} … `);
  try {
    const audio = await speak(key, t.line);
    await writeFile(join(OUT_DIR, t.file), audio);
    manifest.entries[t.line.id] = {
      file: t.file, hash: t.hash, text: t.line.text,
      voiceId: t.line.voiceId, bytes: audio.length,
    };
    await saveManifest(manifest);
    ok++;
    console.log(`ok (${Math.round(audio.length / 1024)} KB)`);
  } catch (e) {
    failed++;
    console.log(`FAILED — ${scrub(e.message)}`);
  }
}

console.log(`\nDone. ${ok} generated, ${failed} failed.`);
if (failed) process.exit(1);