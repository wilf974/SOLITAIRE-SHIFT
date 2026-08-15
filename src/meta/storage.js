// src/meta/storage.js — persistent profile via localStorage. Versioned, with export/import.

import { defaultIdle } from './idle.js';

const KEY = 'solitaire-shift:profile:v1';
const SCHEMA_VERSION = 2;

export function defaultProfile() {
  return {
    version: SCHEMA_VERSION,
    xp: 0,
    tier: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    traitsUnlocked: ['kings-only'], // default always-on
    backs: [{ id: 'sunburst-pop', unlocked: true }, { id: 'bubblegum-nebula', unlocked: false }, { id: 'mint-crest', unlocked: false }],
    courtFamilies: [{ id: 'regalia', unlocked: true }, { id: 'herald', unlocked: false }, { id: 'oracle', unlocked: false }],
    themes: [{ id: 'sunlit', unlocked: true }, { id: 'night', unlocked: false }],
    collections: {}, // collectionId -> { found:[...], total:n }
    achievements: [], // ids earned
    secrets: [], // ids discovered
    stats: {
      totalMoves: 0,
      totalScore: 0,
      fastestWinMs: null,
      fewestMovesWin: null,
      drawsUsed: 0,
      undosUsed: 0,
      dealsCompleted: 0,
      traitsUsed: {},
      modesPlayed: {},
    },
    activeBack: 'sunburst-pop',
    activeTheme: 'sunlit',
    activeCourt: 'regalia',
    lastDaily: null,
    ascension: { bestLevel: 0, runs: [] },
    settings: { muted: false, reduceMotion: false, autoFlip: true },
    history: { resume: null }, // last in-progress game snapshot
    idle: defaultIdle(),
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return defaultProfile();
    return migrate({ ...defaultProfile(), ...p });
  } catch (e) {
    return defaultProfile();
  }
}

export function saveProfile(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch (e) {
    return false;
  }
}

export function exportProfile(p) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(p))));
}
export function importProfile(str) {
  const p = JSON.parse(decodeURIComponent(escape(atob(str))));
  return migrate({ ...defaultProfile(), ...p });
}

function migrate(p) {
  // v1 -> v2: the idle layer. Existing players keep everything and simply
  // gain a fresh (empty) idle economy.
  if (!p.idle || typeof p.idle !== 'object') p.idle = defaultIdle();
  else {
    const d = defaultIdle();
    p.idle = { ...d, ...p.idle };
    if (!p.idle.dealers || typeof p.idle.dealers !== 'object') p.idle.dealers = {};
    if (!Array.isArray(p.idle.upgrades)) p.idle.upgrades = [];
    if (!Number.isFinite(p.idle.coins)) p.idle.coins = 0;
    if (!Number.isFinite(p.idle.lifetimeCoins)) p.idle.lifetimeCoins = p.idle.coins;
    if (!Number.isFinite(p.idle.lastTick)) p.idle.lastTick = Date.now();
  }
  if (p.version !== SCHEMA_VERSION) p.version = SCHEMA_VERSION;
  return p;
}