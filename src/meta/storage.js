// src/meta/storage.js — persistent profile via localStorage. Versioned, with export/import.

import { defaultPowers } from './powers.js';
import { defaultRewards } from './rewards.js';

const KEY = 'solitaire-shift:profile:v1';
const SCHEMA_VERSION = 5;

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
    battle: { defeated: [], bestCombo: 0, wins: 0, losses: 0 },
    rewards: defaultRewards(),
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
  if (!p.battle || typeof p.battle !== 'object') p.battle = { defeated: [], bestCombo: 0, wins: 0, losses: 0 };
  if (!Array.isArray(p.battle.defeated)) p.battle.defeated = [];
  if (!Number.isFinite(p.battle.bestCombo)) p.battle.bestCombo = 0;

  // v3 -> v4: boss rewards. Existing players keep whatever they had equipped.
  // v4 -> v5: `rewards` owns the equipped back. The old top-level activeBack
  // was never written on equip, so anything still reading it reverted the
  // player's choice on the next deal.
  //
  // Read the legacy value BEFORE merging defaults: the merge below fills
  // rewards.activeBack with the default, which would mask the inherited one.
  const legacyBack = p.activeBack;
  delete p.activeBack;

  const hadRewards = p.rewards && typeof p.rewards === 'object';
  const defs = defaultRewards();
  if (!hadRewards) p.rewards = defs;
  else {
    const chosen = p.rewards.activeBack;   // an explicit choice, if any
    p.rewards = { ...defs, ...p.rewards };
    if (!chosen && legacyBack) p.rewards.activeBack = legacyBack;
    for (const bucket of ['backs', 'tables', 'trims']) {
      if (!Array.isArray(p.rewards[bucket])) p.rewards[bucket] = [...defs[bucket]];
      // the starter items can never be missing
      for (const id of defs[bucket]) if (!p.rewards[bucket].includes(id)) p.rewards[bucket].push(id);
    }
  }
  if (!hadRewards && legacyBack) p.rewards.activeBack = legacyBack;

  // never leave the profile pointing at something it does not own
  if (!p.rewards.backs.includes(p.rewards.activeBack)) {
    p.rewards.activeBack = p.rewards.backs[0] || 'sunburst-pop';
  }
  if (!p.rewards.tables.includes(p.rewards.activeTable)) {
    p.rewards.activeTable = p.rewards.tables[0] || 'sunlit';
  }
  if (!p.rewards.trims.includes(p.rewards.activeTrim)) {
    p.rewards.activeTrim = p.rewards.trims[0] || 'plain';
  }

  if (p.version !== SCHEMA_VERSION) p.version = SCHEMA_VERSION;
  return p;
}