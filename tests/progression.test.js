// tests/progression.test.js — mastery progression: XP, tiers, unlocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFromXp, xpForTier, tierProgress, xpForResult, evaluateUnlocks, applyUnlocks } from '../src/meta/mastery.js';
import { TRAITS } from '../src/engine/traits.js';
import { defaultProfile } from '../src/meta/storage.js';

test('tierFromXp is monotonic and starts at 0', () => {
  assert.equal(tierFromXp(0), 0);
  assert.equal(tierFromXp(-50), 0); // negative clamped
  assert.ok(tierFromXp(1000) > tierFromXp(100));
  assert.ok(tierFromXp(20000) >= 9, '20k xp should be high tier');
});

test('xpForTier is the inverse boundary of tierFromXp', () => {
  for (const t of [0, 1, 3, 5, 8]) {
    assert.ok(tierFromXp(xpForTier(t)) <= t, `tier ${t} boundary`);
    assert.ok(tierFromXp(xpForTier(t + 1)) >= t, `tier ${t} next boundary`);
  }
});

test('tierProgress is bounded 0..1', () => {
  for (const xp of [0, 250, 800, 5000, 20000]) {
    const p = tierProgress(xp);
    assert.ok(p.pct >= 0 && p.pct <= 1, `xp ${xp} pct ${p.pct}`);
    assert.ok(p.hi > p.lo, `xp ${xp} lo<hi`);
  }
});

test('xpForResult: a loss gives a small consolation, never negative', () => {
  const xp = xpForResult({ won: false, foundationCards: 20, mode: 'classic' });
  assert.ok(xp > 0 && xp < 30, `loss xp ${xp}`);
  assert.ok(Number.isInteger(xp));
});

test('xpForResult: a clean no-undo win beats a messy win', () => {
  const clean = xpForResult({ won: true, mode: 'classic', moves: 80, undosUsed: 0, streak: 5, traits: [] });
  const messy = xpForResult({ won: true, mode: 'classic', moves: 300, undosUsed: 12, streak: 0, traits: [] });
  assert.ok(clean > messy, `clean ${clean} > messy ${messy}`);
});

test('xpForResult: hard traits multiply rewards', () => {
  const easy = xpForResult({ won: true, mode: 'contract', moves: 100, undosUsed: 0, streak: 1, traits: [] });
  const hard = xpForResult({ won: true, mode: 'contract', moves: 100, undosUsed: 0, streak: 1, traits: ['no-recycle', 'same-suit', 'no-undo'] });
  assert.ok(hard > easy, `hard ${hard} > easy ${easy}`);
});

test('evaluateUnlocks: a first win unlocks the first-win achievement', () => {
  // mirror the real flow: recordResult increments wins BEFORE evaluating
  const p = defaultProfile();
  p.wins = 1;
  const earned = evaluateUnlocks(p, { won: true, mode: 'classic', moves: 100, undosUsed: 0, traits: [] });
  assert.ok(earned.some((u) => u.id === 'ach:first-win'), 'first-win should trigger');
});

test('applyUnlocks mutates profile and is idempotent', () => {
  const p = defaultProfile();
  p.wins = 1;
  const earned = evaluateUnlocks(p, { won: true, mode: 'classic', moves: 100, undosUsed: 0, traits: [] });
  applyUnlocks(p, earned);
  // re-evaluate: nothing new (already earned)
  const earned2 = evaluateUnlocks(p, { won: true, mode: 'classic', moves: 100, undosUsed: 0, traits: [] });
  assert.equal(earned2.length, 0, 'no re-earning');
});

test('tier-gated trait unlocks fire at the right tier', () => {
  const p = defaultProfile();
  p.xp = xpForTier(2) + 1; // just into tier 2
  p.tier = tierFromXp(p.xp);
  const earned = evaluateUnlocks(p, { won: true, mode: 'classic', moves: 100, undosUsed: 0, traits: [] });
  const traitUnlocks = earned.filter((u) => u.kind === 'trait');
  assert.ok(traitUnlocks.length >= 1, 'tier 2 should unlock at least one trait');
  for (const u of traitUnlocks) assert.ok(u.tier <= 2);
});

test('back:mint-crest unlocks at a 5-streak', () => {
  const p = defaultProfile();
  p.bestStreak = 5;
  const earned = evaluateUnlocks(p, { won: true, mode: 'classic', moves: 100, undosUsed: 0, traits: [], streak: 5 });
  assert.ok(earned.some((u) => u.id === 'back:mint-crest'));
});