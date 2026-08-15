// src/ui/art.js — runtime lookup for build-generated OpenAI art.
//
// The art is generated build-side by tools/gen-art/generate.js and committed as
// PNGs. This module only READS the resulting manifest. No API key is involved
// at runtime — the browser never sees one and never talks to OpenAI.
//
// If the manifest or an image is missing, every lookup returns null and the
// renderer falls back to its programmatic CSS art. The game always runs.

// Absolute URL derived from this module's own location, so the paths work from
// CSS (resolved against the stylesheet) and from any deploy sub-path alike.
const BASE = new URL('../assets/art/', import.meta.url).href;

let manifest = null;
let loaded = false;

/** Load the art manifest once. Safe to call repeatedly. Never throws. */
export async function loadArt() {
  if (loaded) return manifest;
  loaded = true;
  try {
    const res = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = await res.json();
    manifest = json && json.entries ? json : null;
  } catch {
    manifest = null;
  }
  return manifest;
}

function entry(id) {
  return manifest && manifest.entries ? manifest.entries[id] || null : null;
}
function url(id) {
  const e = entry(id);
  if (!e) return null;
  // Cache-bust on the prompt hash: regenerated art has a new hash, so the
  // browser fetches the new PNG instead of serving a stale one.
  return BASE + e.file + (e.hash ? `?v=${e.hash}` : '');
}

/** Illustration for a card face, or null if none exists for it. */
export function cardArtUrl(card) {
  if (!manifest) return null;
  if (card.rank === 'A') return url(`ace-${card.suit}`);
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return url(`court-${card.suit}-${card.rank}`);
  return null; // number cards use crisp programmatic pips
}

/** Card-back illustration for a back family id. */
export function backArtUrl(backId) {
  return url(`back-${backId}`);
}

/** The table surface image for the equipped felt, with a safe fallback. */
export function tableArtUrl(tableId) {
  const named = tableId && tableId !== 'sunlit' ? url(`table-${tableId}`) : null;
  return named || url('table-sunlit-felt');
}

/** How many assets are available (for the workbench). */
export function artCount() {
  return manifest && manifest.entries ? Object.keys(manifest.entries).length : 0;
}