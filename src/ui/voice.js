// src/ui/voice.js — runtime playback for the build-generated voice lines.
//
// Like the art pipeline, this module only READS what was generated offline.
// No API key is involved at runtime; the browser never talks to ElevenLabs.
//
// If the manifest or a clip is missing, every call is a silent no-op and the
// game plays exactly as before — voice is a garnish, never a dependency.

const BASE = new URL('../assets/voice/', import.meta.url).href;

let manifest = null;
let loaded = false;
let muted = false;
let current = null;

/** Load the voice manifest once. Never throws. */
export async function loadVoice() {
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

export function setVoiceMuted(v) {
  muted = !!v;
  if (muted) stopVoice();
}

/** Stop whatever is speaking. Called when a line would overlap another. */
export function stopVoice() {
  if (current) {
    try { current.pause(); current.currentTime = 0; } catch { /* already gone */ }
    current = null;
  }
}

/**
 * Speak a line by id. Returns immediately; playback is fire-and-forget.
 * Lines never queue — a new line replaces the old one, because two bosses
 * talking over each other is worse than a cut-off sentence.
 */
export function say(id) {
  if (muted || !manifest || !manifest.entries) return false;
  const entry = manifest.entries[id];
  if (!entry) return false;

  stopVoice();
  try {
    const audio = new Audio(BASE + entry.file + (entry.hash ? `?v=${entry.hash}` : ''));
    audio.volume = 0.85;
    current = audio;
    // Autoplay can be refused before the first interaction; that is fine.
    audio.play().catch(() => { current = null; });
    audio.addEventListener('ended', () => { if (current === audio) current = null; }, { once: true });
    return true;
  } catch {
    return false;
  }
}

/** How many clips are available (for the workbench). */
export function voiceCount() {
  return manifest && manifest.entries ? Object.keys(manifest.entries).length : 0;
}