// tools/check-syntax.js — compile every JS file without executing it.
// Spawns `node --check` per file (correctly handles ESM import/export).
// No deps. Run: node tools/check-syntax.js

import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const files = [];
walk(join(ROOT, 'src'), files);
walk(join(ROOT, 'tests'), files);
walk(join(ROOT, 'tools'), files);

let fail = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`  OK  ${f.slice(ROOT.length)}`);
  } catch (e) {
    fail++;
    const msg = (e.stderr?.toString() || e.message).split('\n').filter(Boolean).slice(-1)[0] || e.message;
    console.error(`FAIL  ${f.slice(ROOT.length)}\n      ${msg}`);
  }
}

if (fail) { console.error(`\n${fail} syntax error(s)`); process.exit(1); }
console.log(`\nAll ${files.length} files parse cleanly.`);