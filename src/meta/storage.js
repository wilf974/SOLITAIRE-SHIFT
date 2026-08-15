// src/meta/storage.js — persistent profile via localStorage. Versioned, with export/import.

import { defaultPowers } from './powers.js';

const KEY = 'solitaire-shift:profile:v1';
const SCHEMA_VERSION = 3;

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
    powers: defaultPowers(),
    adventure: { chapter: 0, cleared: [] },
    bestTimedMs: null,
    bestTide: 0,
    difficulty: 'standard', // last chosen difficulty level
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
  // v2 -> v3: the idle layer was replaced by spendable powers. Anyone who had
  // idle coins keeps them as power coins; the dealers/upgrades are dropped.
  if (!p.powers || typeof p.powers !== 'object') p.powers = defaultPowers();
  const d = defaultPowers();
  p.powers = { ...d, ...p.powers };
  if (!p.powers.charges || typeof p.powers.charges !== 'object') p.powers.charges = {};
  if (!p.powers.used || typeof p.powers.used !== 'object') p.powers.used = {};
  if (!Number.isFinite(p.powers.coins)) p.powers.coins = 0;
  if (!Number.isFinite(p.powers.lifetimeCoins)) p.powers.lifetimeCoins = p.powers.coins;
  if (p.idle && Number.isFinite(p.idle.coins) && p.idle.coins > 0) {
    p.powers.coins += Math.floor(p.idle.coins);
    p.powers.lifetimeCoins += Math.floor(p.idle.coins);
  }
  delete p.idle;

  if (!p.adventure || typeof p.adventure !== 'object') p.adventure = { chapter: 0, cleared: [] };
  if (!Array.isArray(p.adventure.cleared)) p.adventure.cleared = [];
  if (!Number.isFinite(p.adventure.chapter)) p.adventure.chapter = 0;
  if (!Number.isFinite(p.bestTide)) p.bestTide = 0;
  if (typeof p.difficulty !== 'string') p.difficulty = 'standard';

  if (p.version !== SCHEMA_VERSION) p.version = SCHEMA_VERSION;
  return p;
}