// src/meta/mastery.js — XP, tiers, and condition-based unlocks.
// Unlocks come from BOTH tier progression AND special achievements, so raw XP
// alone cannot farm everything.

import { difficultyValue, rewardMultiplier, TRAITS, traitsAtTier } from '../engine/traits.js';

export function tierFromXp(xp) {
  // gentle curve: tier 0 at 0, ~tier 5 around 5k, ~tier 10 around 20k
  return Math.floor(Math.sqrt(Math.max(0, xp) / 200));
}
export function xpForTier(tier) {
  return Math.round(200 * tier * tier);
}
export function tierProgress(xp) {
  const t = tierFromXp(xp);
  const lo = xpForTier(t);
  const hi = xpForTier(t + 1);
  return { tier: t, lo, hi, pct: Math.max(0, Math.min(1, (xp - lo) / (hi - lo || 1))) };
}

/** Compute XP gained from a completed deal. */
export function xpForResult(res) {
  if (!res.won) {
    // small consolation progress for playing, more for getting close
    const close = res.foundationCards || 0;
    return Math.round(2 + close * 0.6);
  }
  const base = 60;
  const traitMul = rewardMultiplier(res.traits);
  const modeMul = { classic: 1, journey: 1.15, daily: 1.5, contract: 1.6, ascension: 1.4, zen: 0.5 }[res.mode] || 1;
  // efficiency bonuses (fewer moves / faster)
  const moveBonus = res.moves ? Math.max(0, Math.round(40 - res.moves * 0.4)) : 0;
  const noUndoBonus = res.undosUsed === 0 ? 15 : 0;
  const streakBonus = Math.min(40, (res.streak || 0) * 4);
  return Math.round((base + moveBonus + noUndoBonus + streakBonus) * traitMul * modeMul);
}

// ---- Unlock conditions ----
// Each: { id, kind:'trait'|'back'|'court'|'theme'|'achievement'|'secret', name, desc,
//        tier?, test(profile, res, ctx) -> bool }
export const UNLOCKS = [
  // tier-gated traits
  ...TRAITS.filter((t) => t.tier > 0).map((t) => ({
    id: 'trait:' + t.id, kind: 'trait', target: t.id, name: t.name, desc: t.desc,
    tier: t.tier, test: (p) => tierFromXp(p.xp) >= t.tier,
  })),
  // achievement-style unlocks
  { id: 'back:bubblegum-nebula', kind: 'back', target: 'bubblegum-nebula', name: 'Bubblegum Nebula', desc: 'Win a deal with No Recycle.', test: (_p, r) => r.won && (r.traits || []).includes('no-recycle') },
  { id: 'back:mint-crest', kind: 'back', target: 'mint-crest', name: 'Mint Crest', desc: 'Reach a 5-game win streak.', test: (p) => p.bestStreak >= 5 },
  { id: 'theme:night', kind: 'theme', target: 'night', name: 'Midnight Arcade', desc: 'Complete a Daily Deal.', test: (_p, r) => r.won && r.mode === 'daily' },
  { id: 'court:herald', kind: 'court', target: 'herald', name: 'Herald Court', desc: 'Win 10 games.', test: (p) => p.wins >= 10 },
  { id: 'court:oracle', kind: 'court', target: 'oracle', name: 'Oracle Court', desc: 'Win with three hard traits at once.', test: (_p, r) => r.won && difficultyValue(r.traits) >= 6 },
  // achievements
  { id: 'ach:first-win', kind: 'achievement', name: 'First Light', desc: 'Win your first deal.', test: (p) => p.wins >= 1 },
  { id: 'ach:streak-3', kind: 'achievement', name: 'Warming Up', desc: 'Win 3 in a row.', test: (p) => p.bestStreak >= 3 },
  { id: 'ach:streak-10', kind: 'achievement', name: 'Untouchable', desc: 'Win 10 in a row.', test: (p) => p.bestStreak >= 10 },
  { id: 'ach:no-undo-win', kind: 'achievement', name: 'Steady Hand', desc: 'Win without undo.', test: (_p, r) => r.won && r.undosUsed === 0 },
  { id: 'ach:speed', kind: 'achievement', name: 'Swift', desc: 'Win in under 3 minutes.', test: (_p, r) => r.won && r.timeMs && r.timeMs < 180000 },
  { id: 'ach:efficient', kind: 'achievement', name: 'Efficient', desc: 'Win in under 120 moves.', test: (_p, r) => r.won && r.moves && r.moves < 120 },
  { id: 'ach:trait-collector', kind: 'achievement', name: 'Curator', desc: 'Unlock 8 traits.', test: (p) => p.traitsUnlocked.length >= 8 },
  // secrets
  { id: 'secret:zen-master', kind: 'secret', name: 'Stillness', desc: 'Play 10 Zen games.', test: (p) => (p.stats.modesPlayed.zen || 0) >= 10 },
  { id: 'secret:ascension-5', kind: 'secret', name: 'Climber', desc: 'Reach Ascension level 5.', test: (p) => p.ascension.bestLevel >= 5 },
  { id: 'secret:all-traits', kind: 'secret', name: 'Polymath', desc: 'Unlock every trait.', test: (p) => p.traitsUnlocked.length >= TRAITS.length },
];

/** Evaluate all unlocks against profile + last result. Returns newly-earned unlock ids. */
export function evaluateUnlocks(profile, result) {
  const earned = [];
  for (const u of UNLOCKS) {
    // skip already-earned (track by id in profile.achievements + owned sets)
    if (alreadyEarned(profile, u)) continue;
    try {
      if (u.test(profile, result || {})) earned.push(u);
    } catch (e) { /* bad condition, ignore */ }
  }
  return earned;
}

function alreadyEarned(p, u) {
  if (u.kind === 'trait') return p.traitsUnlocked.includes(u.target);
  if (u.kind === 'back') return p.backs.find((b) => b.id === u.target)?.unlocked;
  if (u.kind === 'court') return p.courtFamilies.find((c) => c.id === u.target)?.unlocked;
  if (u.kind === 'theme') return p.themes.find((t) => t.id === u.target)?.unlocked;
  if (u.kind === 'achievement' || u.kind === 'secret') return p.achievements.includes(u.id);
  return false;
}

/** Apply earned unlocks to a profile (mutates). Returns list of applied unlocks. */
export function applyUnlocks(profile, earned) {
  for (const u of earned) {
    if (u.kind === 'trait' && !profile.traitsUnlocked.includes(u.target)) profile.traitsUnlocked.push(u.target);
    if (u.kind === 'back') { const b = profile.backs.find((x) => x.id === u.target); if (b) b.unlocked = true; }
    if (u.kind === 'court') { const c = profile.courtFamilies.find((x) => x.id === u.target); if (c) c.unlocked = true; }
    if (u.kind === 'theme') { const t = profile.themes.find((x) => x.id === u.target); if (t) t.unlocked = true; }
    if ((u.kind === 'achievement' || u.kind === 'secret') && !profile.achievements.includes(u.id)) profile.achievements.push(u.id);
  }
  return earned;
}